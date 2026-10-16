# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) — and any agent reading `AGENTS.md`, a symlink to it — when working with code in this repository.

<!--
Keep this file an INDEX, not an encyclopedia (≤150 lines). Plain markdown LINKS,
never `@path` imports: in Claude Code `@path` is an EAGER import that injects the
whole file every session. Links are lazy — follow them when the work needs them.
AGENTS.md is a symlink to this file; keep it a symlink, a copy drifts.
-->

## What This Project Does

A TypeScript monorepo that automates routine reads against a Chilean stockbroker
portal (currently **Vector Capital**, `portalclientes.vectorcapital.cl`) for the
account owner. One shared domain core (`@albertomarturelo/nemo-core`) backs two surfaces:
a human **CLI** (`nemo`) and an **MCP** server (`nemo-mcp`, stdio) — the
integration point for both **Claude Code** and **Claude Desktop**. The core holds
every rail (token renewal, audit, credential handling), so they apply regardless
of which surface is in front.

This is a ground-up TypeScript rewrite of the proven Python `nemo-cli`; the
hard-won Vector wire knowledge and guardrails are **ported**, the code is not.

> Unofficial. Not affiliated with, endorsed, or sponsored by Vector Capital S.A.
> Corredores de Bolsa. See README for the user-facing disclaimer.

## Methodology

This repo runs under **Context-First Development (CFD)**: decisions-before-code
(ADRs), a context layer each session reads first, and Agent Skills in
`.agents/skills/` (`.claude/skills` is a symlink): `/session-start`,
`/session-close`, `/issue-new`, `/issue-start`, `/release` (manual-only), plus
`/new-decision`, `/review-pr`, `/validate-context`, `/status`. The essay lives
upstream at
[context-first-development](https://github.com/albertomarturelo/context-first-development/blob/main/context-first-development.md);
the binding application is ADR-001 as amended by ADR
`adopt-cfd-upstream-revisions`. Read the essay once if new, not every session.
A `SessionStart` hook injects `docs/CURRENT_STATUS.md` (gitignored, per-clone)
and the ADR index.

## Context Map (read on demand, not upfront)

- Architecture, module map, data flow: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- Tech stack + pinned versions: [docs/STACK.md](docs/STACK.md)
- Conventions: [docs/CONVENTIONS.md](docs/CONVENTIONS.md) — read it before the
  first edit of a session, not at session start.
- Roadmap (surface checklist): [docs/ROADMAP.md](docs/ROADMAP.md)
- Decisions index: [docs/decisions/_index.md](docs/decisions/_index.md)
- Vector wire contracts: [docs/vector-contract/](docs/vector-contract/)
- Local working state: `docs/CURRENT_STATUS.md` (gitignored)

## Build & Run

- Install: `pnpm install`
- Build all packages: `pnpm build` (`tsc -b`, strict typecheck + build)
- Test: `pnpm test` (vitest) — one file: `pnpm test <path>`; one name: `pnpm test -t "<pattern>"`
- Lint / format: `pnpm lint` / `pnpm format` (check: `pnpm format:check`)
- One package: `pnpm --filter @albertomarturelo/nemo-core <script>`
- Run the CLI from source: `pnpm --filter @albertomarturelo/nemo-cli build && node packages/cli/dist/main.js <cmd>`
- Run the MCP server: `node packages/mcp/dist/main.js` (stdio)

## Critical Rules

- **Never hard-code a portal URL or path.** Read from `@albertomarturelo/nemo-core` config
  (`API_BASE_URL`, `ENDPOINTS`). Prod is the only target; no env switch (ADR-004).
- **Surfaces call `@albertomarturelo/nemo-core` tasks only.** The CLI and MCP NEVER reach past
  the task layer into `auth/session` or an adapter — that bypasses token renewal
  and the audit receipt (ADR-003). CI greps for it.
- **Every authenticated portal call goes through `auth/session.request()`** — it
  owns token retrieval + proactive/reactive `RefreshToken` renewal. The only
  exceptions are the two bootstrap calls in `auth/service` (`signIn`,
  `refreshToken`). On renewal failure it clears the token and raises
  `SessionExpiredError` ("run `nemo auth login`") — never re-`SignIn` (ADR-005).
- **The password never reaches the model or the MCP.** Either it is typed at a
  hidden CLI prompt (never a flag/env/arg) and held for one `signIn`, or it is
  typed into Vector's own page in the browser sign-in (`browserLogin`), where it
  never enters nemo. Only the bearer token is cached (`~/.nemo/`). The
  password-taking `login` is exported ONLY from `@albertomarturelo/nemo-core/cli`, so
  the MCP can wire nothing but the credential-free `auth_login`. No MCP tool
  takes a password (ADR-006, ADR `mcp-browser-login`). CI + `server.test.ts`
  guard it.
- **External dependencies go through injectable seams.** `HttpClient`,
  `TokenStore`, `Clock`, `AuditSink` are interfaces with Node defaults (in the
  `@albertomarturelo/nemo-core/node` subpath) and in-memory fakes (`testing`); tests inject
  fakes and never touch the network / disk / clock (ADR-003).
- **No third-party broker libraries.** Every endpoint, param, and field is derived
  from first-hand observation and cited in a code comment; wire contracts live
  under `docs/vector-contract/` (ADR-004).
- **JSON is the default output.** Core tasks return plain JSON-serializable
  objects (the integration contract); the CLI emits JSON by default (`--human` for
  text), the MCP emits `JSON.stringify` (ADR-010).
- **New read surfaces are append-only per module.** A module ships its task +
  `register<Mod>` (CLI) + `register<Mod>Tools` (MCP), each wired by ONE appended
  line. `instruments` is the template (ADR-007).
- **Decisions get an ADR BEFORE implementation.** Run `/new-decision` first
  (ADR-001). New ADRs are `docs/decisions/YYYY-MM-DD-<slug>.md`, cited by slug;
  never a new sequence number. Corrections become conventions — fix the pattern
  and write it into `docs/CONVENTIONS.md` in the same change.
- **This repo is PUBLIC and permanent — nothing sensitive in any PR/commit
  (ADR-012).** Never commit `.env`, anything under `.nemo/`, a real bearer
  token/JWT, or real account PII (email, RUT, holdings, amounts). Tests + docs use
  synthetic data only. It is a mandatory `/review-pr` gate + PR-template checkbox,
  with a CI backstop.
- **Absolute rule — no AI attribution anywhere** (commits, PRs, issues, branches,
  code, docs). Authorship is the human owner.

## When Context and Code Disagree

Code is the truth about WHAT the system does; ADRs are the truth about WHY;
`docs/` describes both and can go stale. If a doc contradicts the code, STOP and
flag the conflict — do not silently trust the doc, and do not "fix" correct code
to match a stale doc.
