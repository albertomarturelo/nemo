# ADR-009: NodeNext module resolution

## Status

Accepted — 2026-07-03.

## Context

The compiled output must run directly on Node with no bundler. Node's ESM loader
requires explicit file extensions on relative imports; TypeScript honours this
only under `NodeNext` module resolution.

## Decision

- **`module` and `moduleResolution` are `NodeNext`** in `tsconfig.base.json`;
  `"type": "module"` everywhere (ESM only).
- **Relative imports end in `.js`** (referring to the compiled output), e.g.
  `import { request } from '../auth/session.js'`. Bare specifiers
  (`@albertomarturelo/nemo-core`, `commander`) stay extensionless. `tsc` errors on a missing
  extension, so this is enforced by the typecheck.
- **Subpath exports** (`@albertomarturelo/nemo-core`, `.../node`, `.../cli`) are declared in the
  core's `package.json` `exports` map with matching `types`.

## Alternatives Considered

1. **`Bundler` module resolution + a bundler (tsup/esbuild) for output.**
   Rejected — adds a build step and a dependency; NodeNext output runs as-is on
   Node with source maps.
2. **CommonJS.** Rejected — the MCP SDK and the modern ecosystem are ESM-first;
   mixing would add interop friction for no benefit.

## Consequences

- Easier: `tsc -b` output is directly runnable (`node dist/main.js`); no bundler
  to configure or debug.
- Obligation: every relative import carries a `.js` extension (a common
  first-day surprise); subpath additions update the `exports` map.
