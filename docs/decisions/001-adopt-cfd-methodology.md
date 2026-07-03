# ADR-001: Adopt Context-First Development (CFD)

## Status

Accepted — 2026-07-03. Lineage: ported wholesale from the Python `nemo-cli`
(its process ADRs 013–024) and the `sii` TypeScript project.

## Context

This is a fresh monorepo that an AI agent and a human will build together over
many short sessions. Without a durable, model-readable context layer, each
session re-derives intent by scanning source — slow, lossy, and how guardrails
get forgotten. The proven answer on the sibling projects is Context-First
Development: decisions-before-code, a small context layer read first each
session, and a fixed set of skills that drive the rituals.

## Decision

- **The context layer lives in `docs/`** and is loaded via `CLAUDE.md` (an INDEX,
  not an encyclopedia): `ARCHITECTURE.md`, `STACK.md`, `CONVENTIONS.md`,
  `ROADMAP.md`, `decisions/` (ADRs), and the local-only `CURRENT_STATUS.md`.
- **Decisions get an ADR BEFORE the code that implements them.** Adding a
  dependency, moving a layer boundary, or picking between plausible patterns →
  run the `new-decision` skill first. Every ADR carries the five mandatory
  sections (CI-checked) and a row in `decisions/_index.md`.
- **Corrections become conventions.** Fix the same violated pattern twice → write
  it into `CONVENTIONS.md` (or a new ADR) in the SAME change; never leave the
  lesson only in chat.
- **Sessions have a start and a close ritual.** `start-session` / `status` orient
  from `CURRENT_STATUS.md` + the ADR index without scanning code;
  `close-session` updates `CURRENT_STATUS.md` before ending — it is the only
  thing the next session reads to know what was in flight, so it is
  non-negotiable. `CURRENT_STATUS.md` is gitignored (per-clone working state).
- **Work units are GitHub issues** with a fixed CFD body template (`issue-new` /
  `issue-start`); **PRs are reviewed against the ADR/CONVENTIONS checklist**
  (`review-pr`), not re-discovered from the diff.
- **Model-facing context is English** (CLAUDE.md, docs, ADRs, skills, code
  identifiers/comments); chat and PR prose with the user may be Spanish.
- **No AI attribution** in any git/GitHub artifact — see CONVENTIONS "Commits &
  PRs".
- **Skills over slash commands.** The CFD rituals ship as `.claude/skills/`
  (model-invocable), not `.claude/commands/`.

## Alternatives Considered

1. **No methodology — just code + a README.** Rejected — the sibling projects
   showed context rot within days; guardrails (credential handling, the surface
   boundary) get silently bypassed.
2. **Heavier process (full RFCs, a wiki).** Rejected — too much ceremony for a
   personal project; ADRs + a five-file context layer hit the point of
   diminishing returns.
3. **Slash commands instead of skills.** Rejected — skills are model-invocable
   and travel with the repo; the CFD rituals are things the agent should reach
   for autonomously.

## Consequences

- Easier: a new session (human or AI) is productive in ~500 tokens of context;
  intent survives across sessions; guardrails are written down and CI-checked.
- Obligation: keep `CLAUDE.md` an index (≤~150 lines); write an ADR before a
  significant change; run `close-session` every time; keep the ADR index in sync
  (CI fails otherwise). The `validate-context` skill audits this.
