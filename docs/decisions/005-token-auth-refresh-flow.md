# ADR-005: Bearer-token auth with proactive + reactive refresh

## Status

Accepted — 2026-07-03. Ported from the Python `nemo-cli` (ADR-012 refresh ladder,
ADR-025 no-stored-credentials amendment).

## Context

Vector authenticates with a JWT bearer token. `SignIn` mints one from
credentials; `RefreshToken` mints a fresh one from the current (still-valid)
token. There is no separate refresh-token and no re-auth without the password —
and we deliberately do NOT store the password (ADR-006). So a token that fully
lapses can only be recovered by the user signing in again.

## Decision

- **One authenticated HTTP path: `auth/session.request()`.** Every domain task
  reaches the portal through it; it attaches `Authorization: Bearer <token>` and
  owns renewal. Tasks never build their own request or touch the token store.
- **Proactive renewal:** before using a cached token, if it is within
  `PROACTIVE_REFRESH_SECONDS` of its `exp` (a signature-UNVERIFIED peek), renew
  via `RefreshToken` first.
- **Reactive renewal:** on a `401` (the proactive check missed — server-side
  revocation, clock skew), try `RefreshToken` once and retry the request.
- **Fail closed to re-login:** if renewal fails, clear the cached token and raise
  `SessionExpiredError` ("run `nemo auth login`"). NEVER re-`SignIn` from stored
  credentials — there are none. No cached token at all → `NotAuthenticatedError`.
- The only calls that bypass `request()` are the two bootstrap calls in
  `auth/service` (`signIn`, `refreshToken`).

## Alternatives Considered

1. **Store credentials and re-`SignIn` on expiry (nemo-cli's original ADR-012).**
   Rejected — storing the password is the exact risk ADR-006 removes; the
   `RefreshToken` rung covers the common case, and re-login covers the rest.
2. **Only reactive (401) renewal, no proactive peek.** Rejected — proactive
   renewal avoids a guaranteed-failed first request on a nearly-expired token and
   is cheap (a local `exp` read).
3. **Verify the JWT signature before trusting `exp`.** Rejected — we don't hold
   the signing key; the server is the authority (the 401 path is the real gate),
   so an unverified `exp` peek is purely a renewal-timing hint.

## Consequences

- Easier: tokens renew transparently; a single, testable place owns the whole
  flow; expiry surfaces as one actionable message.
- Obligation: the proactive window is a constant in config; a task must go through
  `request()` (CI's surface boundary + code review enforce it); `login` (the only
  minting path) stays CLI-only (ADR-006).
