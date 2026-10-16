# Tech Stack

## Runtime & toolchain

- **TypeScript** `^5.6` — `strict` plus `noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes`, `noImplicitOverride`. This is the equivalent of
  the Python project's `pyright --strict` gate; keep it at zero errors (ADR-002).
  Module mode is **NodeNext**: relative imports end in `.js` so `tsc -b` output
  runs directly on Node with no bundler (ADR-009).
- **Node.js** `>=20` (LTS) — the runtime for both surfaces (CLI + MCP).
  `@albertomarturelo/nemo-core` is a Node library; external dependencies sit behind
  injectable seams for testability (ADR-003). The default `HttpClient` uses Node's
  global `fetch` — no HTTP-client dependency.
- **pnpm** `10.x` workspaces (pinned `pnpm@10.33.2` via `packageManager`, the
  single source of truth read by CI) — the monorepo package manager. TypeScript
  project references (`tsc -b`) wire `@albertomarturelo/nemo-core` into each surface (ADR-002).
- macOS `aarch64` dev machine; portable to Linux. No Windows-specific bits.

## Infrastructure libraries (general-purpose, NOT broker-specific — ADR-004)

- **`@modelcontextprotocol/sdk`** `^1.29` — MCP server SDK (TypeScript), stdio
  transport. The stdio server is what Claude Code and Claude Desktop both connect
  to. Exposes Resources (session/config) and Tools (browser login, status, logout, reads).
  Lives in `@albertomarturelo/nemo-mcp` only.
- **`zod`** `^3.25` — MCP tool input-schema validation. The SDK's `registerTool`
  takes a zod shape and emits the protocol JSON Schema. Pinned to satisfy the
  SDK's peer (`^3.25 || ^4.0`). Direct dependency of `@albertomarturelo/nemo-mcp` only; boundary
  validation lives at the MCP edge, not in the core (ADR-011).
- **`commander`** `^12.1.0` — the CLI framework for `@albertomarturelo/nemo-cli` (ADR-008). Nested
  subcommands (`nemo auth login`, `nemo instruments local`). Lives in `@albertomarturelo/nemo-cli`
  only; `@albertomarturelo/nemo-core` never imports it. The hidden password prompt uses
  Node's built-in `readline` — no dependency.
- **`playwright`** `^1.64` — the headed browser behind MCP browser sign-in
  (`PlaywrightBrowserLogin`, ADR `mcp-browser-login`). An OPTIONAL peer of
  `@albertomarturelo/nemo-core`, imported lazily by the `./node` adapter only. It
  is a direct dependency of `@albertomarturelo/nemo-mcp` and `@albertomarturelo/nemo-cli`
  (`auth login --browser`). The browser binary is Playwright's Chromium
  (`npx playwright install chromium`), falling back to an installed Chrome.

`@albertomarturelo/nemo-core` itself has **zero runtime dependencies**: it uses the Node
standard library (`fetch`, `node:fs`, `node:os`, `node:path`, `Buffer`) behind
its seams. That keeps the library embeddable and its static import graph clean.

## Dev tooling

- **vitest** `^2.x` — test runner. Tests must NOT hit the production portal:
  every test injects the in-memory `HttpClient` fake (no network, no PII).
- **ESLint** `^9` (flat config) + **typescript-eslint** `^8` — linting.
- **Prettier** `^3` — formatting. `docs/**` and `.claude/**` are Prettier-ignored
  (hand-authored; markdownlint owns them). Format before commit.
- **tsc** `-b` — build + typecheck via project references.

## In-house broker modules (no third-party broker libraries — ADR-004)

All Vector-domain code is written from first-hand observation and cited in code
(`// observed at <URL> on <YYYY-MM-DD>`). The wire contracts are documented under
`docs/vector-contract/`. The remaining surfaces are listed in `docs/ROADMAP.md`.

Update this file whenever a version is pinned or a TBD is resolved by an ADR.
