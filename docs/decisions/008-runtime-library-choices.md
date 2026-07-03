# ADR-008: Runtime library choices — commander, MCP SDK, node composition subpath

## Status

Accepted — 2026-07-03.

## Context

Each package needs a small number of infrastructure libraries. The choices should
keep `@albertomarturelo/nemo-core` dependency-free (embeddable) and confine surface-specific
libraries to the surface that uses them.

## Decision

- **`@nemo/cli` uses `commander` `^12`** for the command tree (nested subcommands:
  `nemo auth login`, `nemo instruments local`). The hidden password prompt uses
  Node's built-in `readline` — no extra dependency.
- **`@nemo/mcp` uses `@modelcontextprotocol/sdk` `^1.29`** (stdio transport) and
  **`zod` `^3.25`** for tool input schemas (ADR-011), pinned to satisfy the SDK's
  peer (`^3.25 || ^4.0`).
- **`@albertomarturelo/nemo-core` has ZERO runtime dependencies.** It uses the Node
  standard library (`fetch`, `node:fs`, `node:os`, `node:path`, `Buffer`) behind
  its seams. The Node default adapters + `createNodeRuntime` live in the
  `@albertomarturelo/nemo-core/node` subpath, kept OFF the main barrel so importing the
  library's tasks never evaluates `node:*` — a consumer that injects its own seams
  stays free of them.

## Alternatives Considered

1. **A heavier CLI framework (oclif) or `yargs`.** Rejected — commander is the
   lowest-friction fit for a small nested command tree; oclif's plugin model is
   overkill.
2. **An HTTP-client dependency (`undici`, `axios`, `got`).** Rejected — Node's
   global `fetch` covers the need behind the `HttpClient` seam; a dependency buys
   nothing and bloats the core.
3. **Put the Node adapters on the main barrel.** Rejected — that would pull
   `node:*` into every consumer's import graph; the `./node` subpath keeps the
   main barrel pure and embeddable.

## Consequences

- Easier: the core stays tiny and embeddable; surface libraries are isolated;
  `fetch`/`readline` remove two dependencies outright.
- Obligation: the zod range must track the MCP SDK's peer; new adapters go under
  `adapters/node` and are exposed via `./node`, never the main barrel.
