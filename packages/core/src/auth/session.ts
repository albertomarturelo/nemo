// The consume-path for every authenticated portal call (ADR-003 / ADR-005). Domain
// tasks NEVER build their own HTTP request or touch the token store — they call
// `request()`, the single point that owns token retrieval, proactive renewal, and
// the reactive 401-refresh-once flow. This is the TS port of nemo-cli's
// `api_request()`; centralizing it here is what makes the renewal rails apply
// uniformly to the CLI and the MCP server.
import { API_BASE_URL, ENDPOINTS, PROACTIVE_REFRESH_SECONDS } from '../config/index.js';
import { NotAuthenticatedError, SessionExpiredError } from '../errors/index.js';
import type { HttpResponse, Runtime } from '../seams/index.js';
import { isExpiringWithin } from './jwt.js';
import { refreshToken } from './service.js';

/** Return a usable bearer token, renewing proactively if it is close to expiry.
 *  Raises `NotAuthenticatedError` when there is no cached token, or
 *  `SessionExpiredError` when the proactive renew fails (both → "re-login"). */
export async function ensureToken(rt: Runtime): Promise<string> {
  const cached = await rt.tokens.get();
  if (cached === null) {
    throw new NotAuthenticatedError('Session expired — run `nemo auth login` to authenticate.');
  }
  if (isExpiringWithin(cached, PROACTIVE_REFRESH_SECONDS, rt.clock.now())) {
    let renewed: string;
    try {
      renewed = await refreshToken(rt, cached);
    } catch (error) {
      await rt.tokens.clear();
      throw error instanceof SessionExpiredError ? error : new SessionExpiredError();
    }
    await rt.tokens.set(renewed);
    return renewed;
  }
  return cached;
}

/** Options for an authenticated portal request. `path` is one of `config.ENDPOINTS`
 *  (never a hand-written URL — ADR-004). */
export interface AuthedRequest {
  method: string;
  path: string;
  params?: Record<string, string | number | boolean>;
  body?: unknown;
  timeoutMs?: number;
}

/** Send an authenticated request to the Vector portal. Attaches the bearer token,
 *  and on a 401 (proactive check missed: server-side revocation, clock skew) tries
 *  RefreshToken once and retries. If renewal fails, clears the token and raises
 *  `SessionExpiredError` rather than re-authenticating (there are no stored
 *  credentials — ADR-005). Non-2xx handling for the retried call is left to the
 *  caller, which surfaces the portal's message verbatim. */
export async function request(rt: Runtime, req: AuthedRequest): Promise<HttpResponse> {
  const url = `${API_BASE_URL}${req.path}`;
  const send = (token: string): Promise<HttpResponse> =>
    rt.http.send({
      method: req.method,
      url,
      ...(req.params ? { params: req.params } : {}),
      ...(req.body !== undefined ? { body: req.body } : {}),
      headers: { Authorization: `Bearer ${token}` },
      timeoutMs: req.timeoutMs ?? 15_000,
    });

  const token = await ensureToken(rt);
  const response = await send(token);
  if (response.status !== 401) return response;

  let renewed: string;
  try {
    renewed = await refreshToken(rt, token);
  } catch (error) {
    await rt.tokens.clear();
    throw error instanceof SessionExpiredError ? error : new SessionExpiredError();
  }
  await rt.tokens.set(renewed);
  return send(renewed);
}

/** Re-export so `config.ENDPOINTS` and this module travel together for callers. */
export { ENDPOINTS };
