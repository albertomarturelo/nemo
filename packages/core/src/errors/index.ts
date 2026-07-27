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
