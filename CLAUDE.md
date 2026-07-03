# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

<!-- Keep this file an INDEX, not an encyclopedia. Target ≤150 lines; move prose to a docs/*.md and @reference it. -->

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
(ADRs), a context layer each session reads first, and skills in `.claude/skills/`
(`/start-session`, `/close-session`, `/status`, `/new-decision`, `/issue-new`,
`/issue-start`, `/review-pr`, `/validate-context`). The methodology essay is in
`context-first-development.md`; the binding application is ADR-001. Read the essay
once if new; do not re-read it every session.

## Architecture

@docs/ARCHITECTURE.md

## Tech Stack

@docs/STACK.md

## Conventions

@docs/CONVENTIONS.md

## Roadmap

@docs/ROADMAP.md

## Key Decisions

@docs/decisions/_index.md

## Current Status

Tracked locally only — `docs/CURRENT_STATUS.md` is gitignored, so each clone keeps
its own working notes. Not loaded automatically; the `start-session` / `status`
skills read it from disk, and `close-session` updates it before the end.

## Build & Run

- Install: `pnpm install`
- Build all packages: `pnpm build` (`tsc -b`, strict typecheck + build)
- Test: `pnpm test` (vitest) — one file: `pnpm test <path>`; one name: `pnpm test -t "<pattern>"`
- Lint / format: `pnpm lint` / `pnpm format` (check: `pnpm format:check`)
- One package: `pnpm --filter @albertomarturelo/nemo-core <script>`
- Run the CLI from source: `pnpm --filter @nemo/cli build && node packages/cli/dist/main.js <cmd>`
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
- **The password is CLI-only and never reaches the model.** It is entered at a
  hidden CLI prompt — never a flag/env/arg — held for one `signIn`, then
  discarded; only the bearer token is cached (`~/.nemo/`). `login` is exported
  ONLY from `@albertomarturelo/nemo-core/cli`, so the MCP server cannot wire a sign-in tool.
  No MCP tool takes a password (ADR-006). CI + `server.test.ts` guard it.
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
  (ADR-001). Corrections become conventions — fix the pattern and write it into
  `docs/CONVENTIONS.md` in the same change.
- **This repo is PUBLIC and permanent — nothing sensitive in any PR/commit
  (ADR-012).** Never commit `.env`, anything under `.nemo/`, a real bearer
  token/JWT, or real account PII (email, RUT, holdings, amounts). Tests + docs use
  synthetic data only. It is a mandatory `/review-pr` gate + PR-template checkbox,
  with a CI backstop.
- **Absolute rule — no AI attribution anywhere** (commits, PRs, issues, branches,
  code, docs). Authorship is the human owner.

<!--
Slash-equivalent skills live in .claude/skills/ — run /start-session at the start
of a session and /close-session before ending one.
-->
