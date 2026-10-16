# Architecture Decision Records

Foundational decisions for the TypeScript **nemo** monorepo. This repo is a
ground-up TS rewrite of the proven Python `nemo-cli`; lineage to that project's
ADRs is cited inside each record where a rule is ported.

Every ADR carries the five mandatory sections (`Status`, `Context`, `Decision`,
`Alternatives Considered`, `Consequences`) — CI enforces it. Add a new one with
the `new-decision` skill and append its row here in the same change.

New ADRs are `YYYY-MM-DD-<slug>.md` and the slug is the ID (cite as `ADR <slug>`);
numbered ADRs keep their number forever. One table, ordered by date
(ADR `adopt-cfd-upstream-revisions`).

| ID  | Title                                                                                     | Status   | Date       |
| --- | ----------------------------------------------------------------------------------------- | -------- | ---------- |
| 001 | [Adopt Context-First Development (CFD)](001-adopt-cfd-methodology.md)                       | Accepted | 2026-07-03 |
| 002 | [TypeScript + Node + pnpm-workspaces monorepo toolchain](002-typescript-node-pnpm-monorepo.md) | Accepted | 2026-07-03 |
| 003 | [Shared core consumed by CLI + MCP; injectable seams](003-shared-core-ports-adapters.md)   | Accepted | 2026-07-03 |
| 004 | [Vector portal contract — single-env, no third-party broker libs](004-vector-contract-single-env.md) | Accepted | 2026-07-03 |
| 005 | [Bearer-token auth with proactive + reactive refresh](005-token-auth-refresh-flow.md)      | Accepted | 2026-07-03 |
| 006 | [Credentials are CLI-only and never reach MCP](006-credentials-cli-only-never-mcp.md)      | Accepted | 2026-07-03 |
| 007 | [Modular core + append-only per-module surfaces](007-modular-core-append-only-surfaces.md) | Accepted | 2026-07-03 |
| 008 | [Runtime library choices — commander, MCP SDK, node composition subpath](008-runtime-library-choices.md) | Accepted | 2026-07-03 |
| 009 | [NodeNext module resolution](009-nodenext-module-resolution.md)                            | Accepted | 2026-07-03 |
| 010 | [JSON is the default output; core is the JSON contract](010-json-default-output.md)        | Accepted | 2026-07-03 |
| 011 | [zod for MCP tool input validation](011-zod-mcp-input-validation.md)                       | Accepted | 2026-07-03 |
| 012 | [Public repository — no sensitive data in any git/GitHub artifact](012-public-repo-no-sensitive-data.md) | Accepted | 2026-07-03 |
| 013 | [Rename `portfolio` → `cartera`; entrenched-Spanish surface naming](013-cartera-spanish-surface-naming.md) | Accepted | 2026-07-07 |
| 014 | [Publish `@albertomarturelo/nemo-core` to npm via tag-triggered CD](014-npm-publish-core-cd.md)          | Accepted | 2026-07-09 |
| 015 | [Publish `@albertomarturelo/nemo-cli` to npm; per-package release tags](015-publish-cli-npm-per-package-tags.md) | Accepted | 2026-07-26 |
| adopt-cfd-upstream-revisions | [Adopt the CFD upstream revisions (Agent Skills, hooks, date-slug ADRs)](2026-10-15-adopt-cfd-upstream-revisions.md) | Accepted | 2026-10-15 |
