// The two bootstrap auth calls, over the HTTP seam. These are the ONLY calls that
// do not ride the authenticated `request()` path: `signIn` mints the first token
// from credentials, and `refreshToken` renews one using the token itself. Both are
// internal to the auth layer — a surface reaches them only through a task
// (`login` in the CLI-only subpath, or the session module's automatic renewal).
import { API_BASE_URL, ENDPOINTS } from '../config/index.js';
import { LoginFailedError, SessionExpiredError } from '../errors/index.js';
import type { Runtime } from '../seams/index.js';

/** Exchange explicit credentials for a bearer token via the SignIn endpoint. The
 *  credentials are passed in by the caller (`login`, collected interactively) and
 *  are never read from the environment or written to disk (ADR-006). */
export async function signIn(rt: Runtime, username: string, password: string): Promise<string> {
  const res = await rt.http.send({
    method: 'POST',
    url: `${API_BASE_URL}${ENDPOINTS.signIn}`,
    body: { userName: username, password },
    timeoutMs: 15_000,
  });
  if (res.status >= 400) {
    throw new LoginFailedError(
      `SignIn failed (${res.status} ${res.statusText}): ${await res.text()}`,
    );
  }
  const token = tokenFromSignIn(await res.json());
  if (token === null) {
    throw new LoginFailedError("SignIn response missing top-level 'token' string.");
  }
  return token;
}

/** Pick the bearer out of a SignIn response body — and nothing else. The body also
 *  carries `user` (PII) and `systemConfig` (docs/vector-contract/auth.md); both are
 *  left untouched. Null when there is no non-empty top-level `token` string. */
export function tokenFromSignIn(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const token = (payload as Record<string, unknown>).token;
  return typeof token === 'string' && token ? token : null;
}

/** Trade an existing bearer token for a freshly minted one. The response body is a
 *  JSON-encoded string containing the new JWT. Raises `SessionExpiredError` on any
 *  non-2xx or malformed payload — there are no stored credentials to fall back to
 *  (ADR-005), so the caller's only recourse is `nemo auth login`. */
export async function refreshToken(rt: Runtime, current: string): Promise<string> {
  const res = await rt.http.send({
    method: 'GET',
    url: `${API_BASE_URL}${ENDPOINTS.refreshToken}`,
    headers: { Authorization: `Bearer ${current}` },
    timeoutMs: 15_000,
  });
  if (res.status >= 400) {
    throw new SessionExpiredError();
  }
  const payload: unknown = await res.json();
  if (typeof payload !== 'string' || !payload) {
    throw new SessionExpiredError();
  }
  return payload;
}
