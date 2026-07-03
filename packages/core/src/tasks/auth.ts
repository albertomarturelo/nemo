// Auth tasks. `authStatus` and `logout` are exported from the MAIN barrel (safe for
// both surfaces). `login` takes a password, so it is exported ONLY from the CLI-only
// subpath `@albertomarturelo/nemo-core/cli` (see ../cli.ts) — the MCP server imports the
// main barrel and must never be able to wire a task that takes credentials (ADR-006).
import { PROACTIVE_REFRESH_SECONDS } from '../config/index.js';
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

export interface LoginResult {
  authenticated: true;
  username: string;
}

/** Sign in with explicit credentials and cache the resulting bearer token. Password-
 *  taking, hence CLI-only (re-exported from `@albertomarturelo/nemo-core/cli`, ADR-006). The
 *  username is echoed back for the receipt; the password never leaves this call. */
export async function login(
  rt: Runtime,
  credentials: { username: string; password: string },
): Promise<LoginResult> {
  return audited(
    rt,
    'auth.login',
    async () => {
      const token = await signIn(rt, credentials.username, credentials.password);
      await rt.tokens.set(token);
      return { authenticated: true as const, username: credentials.username };
    },
    { username: credentials.username },
  );
}
