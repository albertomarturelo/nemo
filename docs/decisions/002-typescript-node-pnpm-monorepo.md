# ADR-002: TypeScript + Node + pnpm-workspaces monorepo toolchain

## Status

Accepted — 2026-07-03. The Python `nemo-cli` stays as the reference
implementation; this repo is the ground-up TypeScript rewrite (knowledge ported,
code rewritten), matching the `sii` project's move.

## Context

The same broker-portal operations must run behind a human CLI and an MCP server
that Claude Code and Claude Desktop connect to. The MCP TypeScript SDK is the
first-class way to build that server, and a single-language monorepo lets one
domain core back both surfaces with shared types and one build.

## Decision

- **TypeScript** in `strict` mode plus `noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes`, `noImplicitOverride` — the equivalent of the
  Python project's `pyright --strict` gate, kept at zero errors.
- **Node.js `>=20`** (LTS) for both surfaces; the core is a Node library.
- **pnpm `10.x` workspaces**, pinned via `packageManager` (the single source of
  truth CI reads). **TypeScript project references** (`tsc -b`) wire
  `@albertomarturelo/nemo-core` into each surface — no bundler.
- Three packages: `packages/core` (`@albertomarturelo/nemo-core`), `packages/cli`
  (`@nemo/cli`), `packages/mcp` (`@nemo/mcp`).

## Alternatives Considered

1. **Keep it Python (extend `nemo-cli`).** Rejected — the MCP server's
   first-class SDK is TypeScript; a TS core gives the MCP surface shared types and
   avoids a second language at the MCP boundary.
2. **A single package, no monorepo.** Rejected — the CLI and MCP have different
   dependencies (commander vs the MCP SDK) and the core must publish independently
   of both; workspaces keep those boundaries clean.
3. **A bundler (esbuild/tsup) for output.** Rejected — NodeNext + `tsc -b` runs
   directly on Node with source maps and no bundle step (ADR-009).

## Consequences

- Easier: one `pnpm build` typechecks + builds everything; the core's types flow
  into both surfaces; the MCP SDK is used natively.
- Obligation: relative imports carry `.js` extensions (NodeNext, ADR-009); the
  pinned pnpm version must match CI; the Python `nemo-cli` and this repo diverge —
  the wire knowledge is ported deliberately, not shared as code.
