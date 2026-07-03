# ADR-003: Shared core consumed by CLI + MCP; injectable seams for external deps

## Status

Accepted — 2026-07-03. Lineage: generalizes the single-HTTP-path discipline of
the Python `nemo-cli` (`api_request()`), and mirrors the `sii` project's ADR-003.

## Context

The same Vector operations must run behind a Node CLI and a Node MCP server. Both
are Node, so the core does not need to avoid Node APIs. What we DO need: every
rail (token retrieval, proactive + reactive `RefreshToken` renewal, the audit
receipt) applied uniformly across both surfaces, AND a way to unit-test the core
without hitting the real portal, the real filesystem, or the wall clock.

## Decision

- **One core package `@albertomarturelo/nemo-core`** holds ALL domain logic and is a normal
  Node library. The CLI and MCP packages are thin: each command / tool is a call
  into a `@albertomarturelo/nemo-core` task. A surface NEVER reaches past the task layer into
  `auth/session` or an adapter — that bypasses the rails. CI enforces this with a
  surface-boundary grep.
- **The task layer is the single public API** (the `@albertomarturelo/nemo-core` barrel);
  surfaces import only it (plus the seam interfaces if they override a default).
- **Injectable seams for external, non-deterministic dependencies.** The core
  declares interfaces and ships DEFAULT Node implementations of each:
  - `HttpClient` — issue an HTTP request (default: Node `fetch`).
  - `TokenStore` — persist/read the cached bearer token (default: fs under `~/.nemo/`).
  - `Clock` — time, for testable JWT-exp math.
  - `AuditSink` — append the JSONL receipt (default: fs append).
  A `Runtime` bundles the four; `createNodeRuntime` (in the `./node` subpath)
  wires the defaults; tests inject in-memory fakes (`testing`).
- **This is DI where it pays — testing + rail centralization — not full hexagonal
  architecture.** Only external dependencies get a seam.

## Alternatives Considered

1. **Let each surface reimplement calls over a thin client.** Rejected — that is
   exactly how the renewal / audit rails get bypassed; "surfaces call tasks only"
   stays non-negotiable (lineage: nemo-cli's single `api_request`).
2. **No seams — the core calls `fetch`/`fs` directly everywhere.** Rejected —
   tests would then hit the real portal / disk / clock, which CONVENTIONS forbid;
   seams are the cheapest way to keep tests hermetic.
3. **Full hexagonal architecture (ports for everything).** Rejected — ceremony
   with no payoff for internal-only collaborators; only the four external deps get
   a seam.

## Consequences

- Easier: the core is unit-testable with in-memory fakes; the same task runs
  identically in the CLI and MCP; no hexagonal boilerplate for internal code.
- Obligation: a CI surface-boundary check forbids CLI/MCP importing a core
  internal directly; every external/non-deterministic dependency gets a seam + a
  Node default + a fake; new capabilities decide explicitly whether they are a
  seam (external) or just core code (internal).
