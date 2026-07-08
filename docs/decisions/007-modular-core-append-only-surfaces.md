# ADR-007: Modular core + append-only per-module surfaces

## Status

Accepted — 2026-07-03.

## Context

The core will grow module by module (instruments local/international/prices,
cartera summary/movements). If every new read edited a shared `program.ts` /
`server.ts` and a barrel, parallel work would collide constantly and the shared
files would churn.

## Decision

- **Each domain module owns its files.** A read surface `<mod>` ships:
  `core/src/tasks/<mod>.ts` (the task + its curated types), a CLI subtree in
  `cli/src/commands/<mod>.ts` exporting `register<Mod>(program, runtime)`, and MCP
  tools in `mcp/src/tools/<mod>.ts` exporting `register<Mod>Tools(server, runtime)`.
- **The shared files call each module from ONE append-only line.** `program.ts`
  and `server.ts` each have a `register…` call per module; adding a module appends
  one line and never edits another module's block. The `@albertomarturelo/nemo-core` barrel
  re-exports the new task in its own append-only block.
- **`instruments` is the template** every later read mirrors in shape and naming.
- Curated, JSON-serializable result objects only (no `Date`/`Map`); the object IS
  the integration contract (ADR-010).

## Alternatives Considered

1. **One big `commands.ts` / `tools.ts`.** Rejected — guaranteed merge conflicts
   and an unreadable file as the surface count grows.
2. **Auto-discovery (scan a directory, register everything).** Rejected — magic
   registration hides the surface list and complicates tree-shaking / typing; an
   explicit append-only line is clearer and greppable.

## Consequences

- Easier: modules are added/worked-on in parallel with near-zero shared-file
  churn; the pattern is copy-paste-able from `instruments`.
- Obligation: keep the register-fn signature uniform; the one shared line per
  module is the only edit to `program.ts` / `server.ts` / the barrel.
