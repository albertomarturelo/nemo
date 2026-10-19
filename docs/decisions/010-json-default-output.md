# ADR-010: JSON is the default output; the core is the JSON contract

## Status

Accepted — 2026-07-03. Ported from the Python `nemo-cli` (`--json` envelope as the
downstream contract) and the `sii` project's ADR-012. Amended by
[`non-interactive-login`](2026-10-19-non-interactive-login.md): an error also
carries a stable `type` (CLI `{ error, type, exitCode }`, MCP `{ error, type }`).

## Context

Both a human and an AI agent (Claude Code via Bash, or an MCP client) consume the
surfaces. Machine consumers want structured data; humans want readable text. The
core already returns plain objects, so the question is only how surfaces present
them.

## Decision

- **`@albertomarturelo/nemo-core` tasks return plain, JSON-serializable objects** (no `Date` /
  `Map` / `Set`, no human formatting). That object IS the library / integration
  contract.
- **The CLI emits JSON by DEFAULT.** `--human` switches to a readable rendering;
  `--json` is the explicit default. A command computes its result once and renders
  it through the shared `emit(data, humanFn)`. STDOUT carries only the result
  (pipeable to `jq`); diagnostics/errors go to STDERR.
- **The MCP surface emits the same object as `JSON.stringify`** (via `toolJson`).
- **Errors are structured too:** in JSON mode the CLI wraps the message as
  `{ "error": "…" }` on STDERR; the MCP wraps it as an `isError` text result.

## Alternatives Considered

1. **Human text by default, `--json` opt-in.** Rejected — the primary consumers
   here are scripts and agents; JSON-by-default makes `nemo … | jq` the happy
   path and keeps the CLI a faithful façade over the library contract.
2. **Different result shapes per surface.** Rejected — one contract object,
   rendered two ways, keeps the CLI and MCP outputs in lockstep for free.

## Consequences

- Easier: driving the CLI from Bash yields structured data; the CLI and MCP never
  drift in what they report; `--human` is a pure presentation layer.
- Obligation: tasks must return only JSON-serializable data; a command renders via
  `emit`, never a bare `out()` for its result; the operating header / diagnostics
  stay on STDERR.
