// Auth tasks. `authStatus`, `logout` and `browserLogin` are exported from the MAIN
// barrel (safe for both surfaces — none takes a credential). `login` takes a password, so it is exported ONLY from the CLI-only
// subpath `@albertomarturelo/nemo-core/cli` (see ../cli.ts) — the MCP server imports the
// main barrel and must never be able to wire a task that takes credentials (ADR-006).
// `unblock` lives there too: the MCP may REPORT the rejection latch but never lift it
// (ADR `non-interactive-login`).
import { BROWSER_LOGIN_TIMEOUT_MS, PROACTIVE_REFRESH_SECONDS } from '../config/index.js';
import {
  LoginBlockedError,
  LoginFailedError,
  LoginRejectedError,
  ValidationError,
} from '../errors/index.js';
import { isExpiringWithin } from '../auth/jwt.js';
import { signIn } from '../auth/service.js';
import { audited } from '../audit/index.js';
import type { LatchEntry, Runtime } from '../seams/index.js';

/** Coarse session state derived from the cached bearer token (read-only, local). */
export type AuthState = 'logged_out' | 'active' | 'expiring' | 'expired';

export interface AuthStatusResult {
  authenticated: boolean;
  state: AuthState;
  /** Users whose unattended sign-in the rejection latch refuses. A caller checks it
   *  BEFORE logging in rather than discovering it as a refusal. */
  loginBlocked: LatchEntry[];
}

/** Report the current session state from the cached token, plus the rejection
 *  latch — never renews, never touches the network. A token we cannot read is
 *  treated as `active` (the server is the authority; the reactive 401 path catches a
 *  token it actually rejects). */
export async function authStatus(rt: Runtime): Promise<AuthStatusResult> {
  const loginBlocked = await rt.latch.list();
  const token = await rt.tokens.get();
  if (token === null) return { authenticated: false, state: 'logged_out', loginBlocked };
  const now = rt.clock.now();
  if (isExpiringWithin(token, 0, now)) {
    return { authenticated: true, state: 'expired', loginBlocked };
  }
  if (isExpiringWithin(token, PROACTIVE_REFRESH_SECONDS, now)) {
    return { authenticated: true, state: 'expiring', loginBlocked };
  }
  return { authenticated: true, state: 'active', loginBlocked };
}

export interface LogoutResult {
  loggedOut: boolean;
}

/** Drop the cached bearer token. Vector exposes no server-side logout, so this is a
 *  local wipe (ported from nemo-cli). Idempotent: reports whether a token was held. */
export async function logout(rt: Runtime): Promise<LogoutResult> {
  return audited(rt, 'auth.logout', async () => {
    const had = (await rt.tokens.get()) !== null;
    await rt.tokens.clear();
    return { loggedOut: had };
  });
}

/** Where a credential sign-in's password comes from. The audit receipt records it,
 *  never the value (ADR `non-interactive-login`). */
export type LoginSource = 'prompt' | 'env' | 'stdin';

export interface LoginRequest {
  username: string;
  source: LoginSource;
  /** Produces the password. Called only when a sign-in is actually needed, so a live
   *  session never prompts for one, nor reads it from its source. */
  password: () => Promise<string>;
}

export interface LoginResult {
  authenticated: true;
  username: string;
  reason: 'signed_in' | 'already_authenticated';
}

/** Sign in with explicit credentials and cache the bearer token with its owner.
 *  Password-taking, hence CLI-only (re-exported from `@albertomarturelo/nemo-core/cli`,
 *  ADR-006). Idempotent, so an unattended caller can run it every time: a cached token
 *  for the same user outside the proactive-refresh window answers
 *  `already_authenticated` without asking for the password. A live token for another
 *  account, or one whose owner was never recorded, is refused rather than silently
 *  answered as someone else (ADR `non-interactive-login`). One `SignIn`, never retried;
 *  the password never leaves this call.
 *
 *  The rejection latch, checked AFTER the live-token check (a cookie-free local read
 *  that submits nothing):
 *  - a rejected password trips it for that user, from any source, the prompt too:
 *    the attempt counted toward Vector's lockout either way;
 *  - while it is set, an `env` / `stdin` sign-in refuses without contacting Vector;
 *  - a successful PROMPT sign-in clears it: a person typing is the reset. */
export async function login(rt: Runtime, request: LoginRequest): Promise<LoginResult> {
  const username = request.username.trim();
  if (!username) throw new ValidationError('An account email is required to sign in.');

  const cached = await rt.tokens.get();
  if (cached !== null && !isExpiringWithin(cached, PROACTIVE_REFRESH_SECONDS, rt.clock.now())) {
    const owner = await rt.tokens.username();
    if (owner !== null && sameAccount(owner, username)) {
      return { authenticated: true, username, reason: 'already_authenticated' };
    }
    throw new ValidationError(
      owner === null
        ? 'A session whose account was not recorded (a browser sign-in?) is active — run `nemo auth logout`, then sign in.'
        : 'A session for another account is active — run `nemo auth logout`, then sign in.',
    );
  }

  const user = latchKey(username);
  if (request.source !== 'prompt') {
    const blocked = (await rt.latch.list()).find((e) => e.user === user);
    if (blocked) {
      await writeBlockedReceipt(rt, username, request.source);
      throw new LoginBlockedError(
        blocked.status,
        blocked.at,
        `Unattended sign-in for ${username} is blocked: Vector rejected its password at ${blocked.at} (HTTP ${blocked.status}). Nothing was sent. A person fixes the password, then signs in at the prompt or runs \`nemo auth unblock\` in a terminal.`,
      );
    }
  }

  return audited(
    rt,
    'auth.login',
    async () => {
      const password = await request.password();
      if (!password) throw new LoginFailedError('Empty password — no sign-in attempted.');
      let token: string;
      try {
        token = await signIn(rt, username, password);
      } catch (error) {
        if (error instanceof LoginRejectedError) {
          const at = new Date(rt.clock.now()).toISOString();
          await rt.latch.trip({ user, at, status: error.status });
        }
        throw error;
      }
      await rt.tokens.set(token, username);
      if (request.source === 'prompt') await rt.latch.clear(user);
      return { authenticated: true as const, username, reason: 'signed_in' as const };
    },
    { username, source: request.source },
  );
}

export interface UnblockResult {
  /** The users whose latch entries were removed; empty when nothing was blocked. */
  unblocked: string[];
}

/** Lift the rejection latch for one user, or for all. Local only: Vector is never
 *  contacted. CLI-only (re-exported from `@albertomarturelo/nemo-core/cli`), and the
 *  CLI refuses it without a terminal: an unattended caller must not be able to lift
 *  the guard that exists to stop it (ADR `non-interactive-login`). */
export async function unblock(rt: Runtime, query: { user?: string } = {}): Promise<UnblockResult> {
  const user = query.user === undefined ? undefined : latchKey(query.user);
  return audited(rt, 'auth.unblock', async () => ({ unblocked: await rt.latch.clear(user) }), {
    ...(user === undefined ? {} : { username: user }),
  });
}

/** The latch's key for an email: trimmed and lower-cased, like `sameAccount`. */
function latchKey(username: string): string {
  return username.trim().toLowerCase();
}

/** The receipt for a latch refusal: no work started, so it is not `audited`. */
async function writeBlockedReceipt(
  rt: Runtime,
  username: string,
  source: LoginSource,
): Promise<void> {
  try {
    await rt.audit.write({
      ts: new Date(rt.clock.now()).toISOString(),
      action: 'auth.login',
      result: 'blocked',
      username,
      source,
    });
  } catch {
    // A receipt is best-effort, as in `audited`.
  }
}

/** Emails compare case-insensitively: `Me@Mail.cl` and `me@mail.cl` are one account. */
function sameAccount(a: string, b: string): boolean {
  return latchKey(a) === latchKey(b);
}

export interface BrowserLoginResult {
  authenticated: true;
  reason: 'signed_in' | 'already_authenticated';
}

/** Sign in through Vector's own page in a visible browser (ADR `mcp-browser-login`).
 *  Takes NO credential — the user types the password into Vector's form and only the
 *  bearer comes back through the `BrowserLogin` seam — so it is safe on the main
 *  barrel the MCP imports. Idempotent: a cached token outside the proactive-refresh
 *  window returns `already_authenticated` without opening a window. */
export async function browserLogin(rt: Runtime): Promise<BrowserLoginResult> {
  const cached = await rt.tokens.get();
  if (cached !== null && !isExpiringWithin(cached, PROACTIVE_REFRESH_SECONDS, rt.clock.now())) {
    return { authenticated: true, reason: 'already_authenticated' };
  }
  const browser = rt.browser;
  if (!browser) {
    throw new LoginFailedError(
      'Browser sign-in is not available here — run `nemo auth login` in a terminal.',
    );
  }
  return audited(
    rt,
    'auth.login',
    async () => {
      const token = await browser.signIn({ timeoutMs: BROWSER_LOGIN_TIMEOUT_MS });
      // The email is typed on Vector's page, so the owner stays unknown — and for the
      // same reason this never clears a latch entry: nemo cannot tell whose it is.
      await rt.tokens.set(token, null);
      return { authenticated: true as const, reason: 'signed_in' as const };
    },
    { source: 'browser' },
  );
}
