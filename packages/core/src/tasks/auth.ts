// Auth tasks. `authStatus`, `logout` and `browserLogin` are exported from the MAIN
// barrel (safe for both surfaces — none takes a credential). `login` takes a password, so it is exported ONLY from the CLI-only
// subpath `@albertomarturelo/nemo-core/cli` (see ../cli.ts) — the MCP server imports the
// main barrel and must never be able to wire a task that takes credentials (ADR-006).
import { BROWSER_LOGIN_TIMEOUT_MS, PROACTIVE_REFRESH_SECONDS } from '../config/index.js';
import { LoginFailedError, ValidationError } from '../errors/index.js';
import { isExpiringWithin } from '../auth/jwt.js';
import { signIn } from '../auth/service.js';
import { audited } from '../audit/index.js';
import type { Runtime } from '../seams/index.js';

/** Coarse session state derived from the cached bearer token (read-only, local). */
export type AuthState = 'logged_out' | 'active' | 'expiring' | 'expired';

export interface AuthStatusResult {
  authenticated: boolean;
  state: AuthState;
}

/** Report the current session state from the cached token — never renews, never
 *  touches the network. A token we cannot read is treated as `active` (the server
 *  is the authority; the reactive 401 path catches a token it actually rejects). */
export async function authStatus(rt: Runtime): Promise<AuthStatusResult> {
  const token = await rt.tokens.get();
  if (token === null) return { authenticated: false, state: 'logged_out' };
  const now = rt.clock.now();
  if (isExpiringWithin(token, 0, now)) return { authenticated: true, state: 'expired' };
  if (isExpiringWithin(token, PROACTIVE_REFRESH_SECONDS, now)) {
    return { authenticated: true, state: 'expiring' };
  }
  return { authenticated: true, state: 'active' };
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
 *  the password never leaves this call. */
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

  return audited(
    rt,
    'auth.login',
    async () => {
      const password = await request.password();
      if (!password) throw new LoginFailedError('Empty password — no sign-in attempted.');
      const token = await signIn(rt, username, password);
      await rt.tokens.set(token, username);
      return { authenticated: true as const, username, reason: 'signed_in' as const };
    },
    { username, source: request.source },
  );
}

/** Emails compare case-insensitively: `Me@Mail.cl` and `me@mail.cl` are one account. */
function sameAccount(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
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
      // The email is typed on Vector's page, so the owner stays unknown.
      await rt.tokens.set(token, null);
      return { authenticated: true as const, reason: 'signed_in' as const };
    },
    { source: 'browser' },
  );
}
