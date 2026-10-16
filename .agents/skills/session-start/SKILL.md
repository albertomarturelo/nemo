---
name: session-start
description: "Orient at the start of a nemo session: read docs/CURRENT_STATUS.md and the decisions index in ~1k tokens, state the focus, and auto-load an in-progress issue if one is referenced. Invoke explicitly at the start of every working session."
disable-model-invocation: true
metadata:
  token-budget: "~500–1,500 baseline; +1,000–2,000 if an in-progress issue is auto-loaded"
---

Run the CFD session-start ritual (ADR `adopt-cfd-upstream-revisions`). The
`SessionStart` hook may already have injected `CURRENT_STATUS.md` + the ADR index
— use that copy instead of re-reading. Otherwise read **only**, in order:

1. `docs/CURRENT_STATUS.md` — what is in progress, what is blocked, what is next.
2. `docs/decisions/_index.md` — recent decisions that may affect the next change.

**Missing status file.** `CURRENT_STATUS.md` is gitignored (per-clone). If absent,
create it with the sections `Last updated`, `In Progress`, `Recently Completed`,
`Known Issues`, `Next Priorities`, populate "In Progress" from
`gh issue list --assignee @me --state open`, then continue.

**Staleness.** If the hook warned, or `git log -1 --format=%cs` is more than one
working day newer than "Last updated", say so and verify its claims against
`git log --oneline` before trusting them.

**Auto-load the in-progress issue.** If `CURRENT_STATUS.md` references in-progress
work by issue number (e.g. `#42`), run `gh issue view <n>` and read each ADR it
lists under "ADRs to load". Do **not** read the files in its "Target" section. If
several issues are in progress, list them and ASK which — do not load all.

Do **not** read source code. The point is to orient in O(1k) tokens.

Then produce a brief (≤ 8 lines) summary:

- What was being worked on at the last session close.
- What is currently blocked and why.
- The objective and acceptance checklist of the loaded issue, if any.
- The focus for THIS session, from `CURRENT_STATUS.md` + `docs/ROADMAP.md`.

Stop after the summary. Do not implement until the user gives a specific task.
