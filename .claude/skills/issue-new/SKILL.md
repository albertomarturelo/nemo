---
description: Create a self-sufficient nemo unit of work as a GitHub Issue with the fixed CFD body template (Context, Target, ADRs to load, Acceptance criteria, Reproduction, Estimated sessions). Use when the user asks to "open an issue", "create a work item", "plan a task", or describes new work to be tracked. Implements CFD (ADR-001).
---

Guide the user through creating a GitHub Issue with the fixed CFD body template. The
completeness of this issue determines how cheaply the next session starts — be
thorough. Ask, in order, and confirm each answer:

1. **Type.** `feature` | `fix` | `chore` | `spike` | `docs`.
2. **Title.** Imperative, ≤ 80 chars, English. e.g. "Add `nemo portfolio summary`".
3. **Context.** 2–4 sentences: the trigger and the user-visible outcome.
4. **Target location.** Concrete paths across the three packages. A new read
   surface `<mod>` typically means: `packages/core/src/tasks/<mod>.ts` (new file),
   `packages/cli/src/commands/<mod>.ts` (new file, registered by one line in
   `program.ts`), `packages/mcp/src/tools/<mod>.ts` (new file, one line in
   `server.ts`) — append-only (ADR-007). Mark each `new file`.
5. **Pattern to mirror.** The existing module the work should copy in shape and
   naming — `instruments` is the template read surface. Flag if no analog exists.
6. **ADRs to load.** ADR numbers the agent must read first (at least the
   architectural ones the change touches: ADR-003 core boundary/seams, ADR-004
   Vector contract, ADR-005 auth, ADR-006 credentials, ADR-007 append-only). If a
   needed decision is not yet an ADR, **STOP and run `new-decision`** — implementing
   an undocumented decision is forbidden (ADR-001).
7. **Acceptance criteria (DoD).** Markdown `[ ]` items covering all three of:
   behaviour at the end (concrete CLI/MCP output or core API), tests (which
   `<module>.test.ts` under vitest, injecting the `HttpClient` fake — no network),
   and docs updated (CONVENTIONS / STACK / ARCHITECTURE / ROADMAP /
   `vector-contract/*.md` / a new ADR).
8. **Reproduction steps.** `fix` only — a minimal repro the agent can run.
9. **Estimated sessions.** `1` | `2–3` | `4+`. If > 1, **propose decomposing into
   sub-issues before continuing** (ADR-001, short sessions).
10. **Labels.** The type plus any component (`core`, `cli`, `mcp`, `auth`,
    `instruments`, `portfolio`, `ci`).

Then generate the body using the fixed template — do not change section order or
names; `issue-start` parses by header:

```markdown
## Context
<step 3>

## Target
- Files / dirs: <step 4>
- Pattern to mirror: <step 5>

## ADRs to load
- [ADR-NNN](docs/decisions/NNN-*.md)

## Acceptance criteria
- [ ] <step 7>

## Reproduction (fixes only)
<step 8 — OR omit this section entirely if not a fix>

## Estimated sessions
<step 9>
```

Then create it:

```bash
gh issue create --title "<step 2>" --body "<body above>" --label "<type>,<labels>"
```

Output the issue URL when done. English for the issue body; the comment thread may
be Spanish.
