// Domain error taxonomy. The CLI maps these to exit codes (see @albertomarturelo/nemo-cli io.ts);
// the MCP surface passes their message through verbatim. Keep the hierarchy flat
// and the messages actionable — the user knows the broker domain (CONVENTIONS).

/** Base class so a surface can `instanceof NemoError` to tell domain from bug. */
export class NemoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** No usable session and no way to renew it — the only path back is `nemo auth
 *  login`. Exit code 2. `SessionExpiredError` is a subtype so both map the same. */
export class NotAuthenticatedError extends NemoError {}

/** A cached token existed but renewal failed (server-side revocation, expiry) and
 *  there are no stored credentials to re-SignIn (ADR-005). Still a "re-login". */
export class SessionExpiredError extends NotAuthenticatedError {
  constructor(message = 'Session expired — run `nemo auth login` to authenticate.') {
    super(message);
  }
}

/** The SignIn endpoint rejected the supplied credentials. Exit code 3. */
export class LoginFailedError extends NemoError {}

/** Vector judged the password and refused it: a `4xx` from `SignIn` other than `408`
 *  (timeout) and `429` (rate limiting). Its
 *  wrong-password response is unobserved, so every such status counts, which errs
 *  toward over-blocking. It trips the rejection latch (ADR `non-interactive-login`). */
export class LoginRejectedError extends LoginFailedError {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** The rejection latch refused an unattended sign-in WITHOUT contacting Vector: its
 *  password was rejected earlier and no person has cleared it since. */
export class LoginBlockedError extends LoginFailedError {
  constructor(
    readonly status: number,
    readonly at: string,
    message: string,
  ) {
    super(message);
  }
}

/** The portal returned a non-2xx for a domain read/write. Carries the HTTP status
 *  so a surface can decide, but the message is surfaced verbatim. Exit code 1. */
export class ApiError extends NemoError {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** A parser could not find the shape it expected in a portal response — the wire
 *  contract drifted. Never retry; surface it so the contract can be re-observed. */
export class ContractError extends NemoError {}

/** The command or the machine is misconfigured (e.g. a relative `NEMO_HOME`).
 *  Nothing was sent to the portal. Exit code 1. */
export class ValidationError extends NemoError {}

/** The stable error kind a caller decides on — never the message text (ADR
 *  `non-interactive-login`). A value is never renamed; a caller treats one it does
 *  not know as `unexpected`. */
export type ErrorType =
  | 'not_authenticated'
  | 'session_expired'
  | 'login_rejected'
  | 'login_blocked'
  | 'login_failed'
  | 'rate_limited'
  | 'api_error'
  | 'contract'
  | 'validation'
  | 'unexpected';

export interface ClassifiedError {
  type: ErrorType;
  /** The error's message verbatim (CONVENTIONS: broker messages pass through). */
  message: string;
}

/** Map any thrown value to its stable `type`, for the CLI's STDERR JSON, the MCP's
 *  error result, and any embedder. Subtypes are checked before their parents. */
export function classifyError(error: unknown): ClassifiedError {
  const message = error instanceof Error ? error.message : String(error);
  return { type: typeOf(error), message };
}

function typeOf(error: unknown): ErrorType {
  if (error instanceof SessionExpiredError) return 'session_expired';
  if (error instanceof NotAuthenticatedError) return 'not_authenticated';
  if (error instanceof LoginRejectedError) return 'login_rejected';
  if (error instanceof LoginBlockedError) return 'login_blocked';
  if (error instanceof LoginFailedError) return 'login_failed';
  if (error instanceof ApiError) return error.status === 429 ? 'rate_limited' : 'api_error';
  if (error instanceof ContractError) return 'contract';
  if (error instanceof ValidationError) return 'validation';
  return 'unexpected';
}
