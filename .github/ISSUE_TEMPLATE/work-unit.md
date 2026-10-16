---
name: Work unit (maintainer)
about: Internal maintainer work unit. Contributors — use Bug report or Feature request instead.
title: ""
labels: []
---

<!-- Fixed 6-section body. `/issue-start` parses by section header — do NOT rename
     or reorder. If a section truly does not apply (e.g. Reproduction on a
     feature), remove ONLY that section. See .agents/skills/issue-new. -->

## Context

<!-- 2–4 sentences: the trigger and the user-visible outcome. -->

## Target

- Files / dirs: <!-- concrete paths across packages; mark `new file` if net-new
     (e.g. `packages/core/src/tasks/<mod>.ts — new file`); list existing files
     that will be modified too (`program.ts`, `server.ts`) -->
- Pattern to mirror: <!-- the existing module to copy in shape/naming (instruments) -->

## ADRs to load

<!-- ADRs the agent must read before starting (numbered, or by slug for newer ones) — at minimum the
     architectural ones the change touches (ADR-003 boundary/seams, ADR-004 Vector
     contract, ADR-005 auth, ADR-006 credentials, ADR-007 append-only). If a needed
     decision isn't an ADR yet, STOP and run /new-decision first. -->

- [ADR-NNN](docs/decisions/NNN-<slug>.md)
- [<slug>](docs/decisions/YYYY-MM-DD-<slug>.md)

## Acceptance criteria

<!-- Definition of Done. The PR description reuses these verbatim. -->

- [ ] <!-- Behavior: concrete CLI/MCP output or @albertomarturelo/nemo-core API that works -->
- [ ] <!-- Tests: which `<module>.test.ts` (vitest); HttpClient fake, no network -->
- [ ] <!-- Docs: which of CONVENTIONS / STACK / ARCHITECTURE / ROADMAP / vector-contract / new ADR is updated -->

## Reproduction (fixes only)

<!-- ONLY for `fix` issues. Minimal repro with expected vs. actual output. Remove
     this section entirely if not a fix. -->

## Estimated sessions

<!-- 1 | 2–3 | 4+. If > 1, decompose into sub-issues before starting. -->

1
