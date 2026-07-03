# ADR-004: Vector portal contract — single-env, no third-party broker libs

## Status

Accepted — 2026-07-03. Ported from the Python `nemo-cli` (hardcoded
`API_BASE_URL`, no env override).

## Context

The Vector Capital portal exposes no official API. Its web UI talks to internal
JSON endpoints under `https://portalclientes.vectorcapital.cl/api`. Those
endpoints, their param names, and their response shapes are only knowable by
first-hand observation of the live portal, and can change without notice. There
is exactly one environment (production).

## Decision

- **The base URL and every endpoint path are constants in `@albertomarturelo/nemo-core`
  config** (`API_BASE_URL`, `ENDPOINTS`). Never hard-code a URL or path anywhere
  else. There is **no `NEMO_ENV` switch**; reintroduce one via a new ADR only if a
  staging environment appears.
- **No third-party broker libraries.** Every endpoint, param, and field is derived
  from first-hand observation of the live portal and cited in a code comment
  (`// observed at <URL> on <YYYY-MM-DD>`).
- **Wire contracts are documented under `docs/vector-contract/<surface>.md`** with
  the request shape, a redacted response, and the observation date. Capture that
  BEFORE integrating a new endpoint; do not assume field names from external docs.
- **Parsing is defensive + curated:** validate the envelope (`typeof` /
  `Array.isArray`), project rows with `asStr`/`asInt`/`asOptionalStr` (missing
  field → empty/zero/null), and raise `ContractError` when the expected shape is
  absent — never retry, re-observe.

## Alternatives Considered

1. **An env-var base URL / multi-env config.** Rejected — there is only prod; a
   switch is dead weight and an easy way to point at the wrong host.
2. **Assume field names from a swagger/OpenAPI or reverse-engineered doc.**
   Rejected — the portal ships none that we trust; observed-and-cited is the only
   safe source.

## Consequences

- Easier: one place to update if the host changes; parsers degrade gracefully on
  a missing field instead of crashing; the contract drift surfaces as a clear
  `ContractError`.
- Obligation: each new endpoint needs a `vector-contract/*.md` entry and cited
  observations; CI greps for third-party broker-lib references and rejects them.
