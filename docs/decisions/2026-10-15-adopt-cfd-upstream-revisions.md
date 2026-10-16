# Adopt the CFD upstream revisions (Agent Skills, hooks, date-slug ADRs)

## Status

Accepted — 2026-10-15. Amends ADR-001; ADR-001 stays Accepted as the record.

## Context

ADR-001 adopted CFD as it stood on 2026-07-03. The methodology repo
(`github.com/albertomarturelo/context-first-development`) has since revised
several of the patterns ADR-001 copied, through its catalog ADRs
`agent-skills-as-procedures`, `enforce-rituals-with-hooks`, `adr-ids-date-slug`,
`current-status-per-developer`, `short-sessions-over-long`,
`single-loop-human-orchestrator`, `parallel-loops-in-worktrees`, and the revised
`session-close-ritual` / `pr-review-against-context`. nemo also vendors a July copy
of the essay that is now ~60 lines behind the canonical one.

## Decision

- **Procedures are Agent Skills at `.agents/skills/<name>/SKILL.md`**;
  `.claude/skills` is a symlink to it, never a copy. Each skill carries `name`
  (matching its folder) and `metadata.token-budget`. The session rituals take the
  upstream names: `session-start` and `session-close` replace `start-session` and
  `close-session`. `status` stays as a nemo-only extra.
- **Boundary rituals are manual-only.** `session-start`, `session-close`,
  `issue-new`, `issue-start` set `disable-model-invocation: true` and ship
  `agents/openai.yaml` with `allow_implicit_invocation: false`. `new-decision`,
  `review-pr`, `validate-context`, `status` stay model-invocable. This reverses
  ADR-001's "the agent reaches for the rituals autonomously".
- **`AGENTS.md` is a symlink to `CLAUDE.md`**, so agents other than Claude Code
  find the same index.
- **`CLAUDE.md` is an index of links, not `@` imports.** `@path` is an eager import
  that injects the whole file every session. The Context Map links the `docs/`
  files; Critical Rules stay inline because they are the always-on guardrails. It
  gains the precedence rule: code is the truth about WHAT, ADRs about WHY, `docs/`
  describes both and can go stale. On conflict, stop and flag it.
- **New ADRs are `docs/decisions/YYYY-MM-DD-<slug>.md`; the slug is the identity**
  (cite as `ADR <slug>`). Numbered ADRs 001–015 are never renamed. CI fails on two
  date-prefixed ADRs sharing a slug.
- **A `SessionStart` hook** (`.claude/hooks/session-start-context.sh`) injects
  `CURRENT_STATUS.md` + the ADR index and warns when the newest commit is more
  than a day past the status file's mtime.
- **`CURRENT_STATUS.md` stays untracked** (already the case). That puts nemo in
  upstream's per-developer mode, so the commit-time status guard and the CI
  freshness warning are NOT installed: both skip themselves when the file is
  untracked.
- **Self-review before close.** Solo, `review-pr` runs on the local diff BEFORE
  `session-close`, and its findings are fixed in the same session.
- **`issue-start` reads Target files that will be modified** (not net-new ones).
- **Restart sessions on context signals**: drift observed, then context fill
  (large tool output, auto-compaction), with wall-clock (~1 h / ~2 h) only as
  fallback.
- **One loop, the developer as orchestrator.** Parallel worktree loops are allowed
  only under upstream's `parallel-loops-in-worktrees` rules: disjoint targets,
  ADRs land on `main` first, merges are serial.
- **The essay is not vendored.** `context-first-development.md` is deleted; the
  canonical copy lives in the methodology repo and is linked from `CLAUDE.md`.
- **Kept nemo-local, deliberately**: status bookkeeping (`CURRENT_STATUS.md` /
  `ROADMAP.md`) stays its own commit (CONVENTIONS); no `project-init` skill, since
  the project is already initialized.

## Alternatives Considered

1. **Stay on the July snapshot.** Rejected: the `@` imports load ~600 lines every
   session, and numbered ADRs collide as soon as two branches decide in parallel.
2. **Adopt upstream's commit guard and CI freshness check anyway.** Rejected: with
   `CURRENT_STATUS.md` untracked both are no-ops by design, and dead guards teach
   that guards can be ignored.
3. **Refresh the vendored essay instead of deleting it.** Rejected: a copy that
   can drift is a second source of truth. Upstream retired its own gist mirror for
   exactly that reason.
4. **Keep the `start-session` / `close-session` names.** Rejected: the names would
   diverge from every other CFD project and from the upstream docs.

## Consequences

- Easier: the always-loaded context shrinks to the index + guardrails;
  orientation happens automatically; parallel branches can write ADRs without
  colliding; any Agent-Skills agent (Codex, Copilot, Gemini CLI) runs the same
  procedures.
- Harder: two ADR ID formats coexist in the index. The rituals no longer fire on
  model judgement, so the user must type `/session-start` and `/session-close`
  (the hook covers orientation). The hook runs only in Claude Code; CI stays the
  agent-agnostic layer.
- Obligation: `docs/ARCHITECTURE.md` / `STACK.md` / `CONVENTIONS.md` are read on
  demand, so `CLAUDE.md` must say when to read them (CONVENTIONS before the first
  edit).
