---
description: Begin a CFD session by orienting on the nemo monorepo's current status and recent decisions without scanning source code. Use when the user asks to "start session", "get oriented", or invokes the CFD session-start ritual.
---

Run the Context-First Development session-start ritual. Read **only** the following
files, in order, and do not scan source code unless a follow-up question requires it:

1. `docs/CURRENT_STATUS.md` — what is in progress, what is blocked, what is next.
   (Local-only; may be absent in a fresh clone — then orient from the rest.)
2. `docs/decisions/_index.md` — recent decisions that may affect the next change.

3. **If `CURRENT_STATUS.md` references in-progress work by issue number** (e.g.
   `#42`), load that unit of work (CFD, ADR-001):

   ```bash
   gh issue view <n>
   ```

   Then read each ADR the issue lists under "ADRs to load" from
   `docs/decisions/`. Do **not** read the files in the issue's "Target" section —
   those are where the work goes, not where context comes from. If no issue is
   referenced, skip this step and orient from `CURRENT_STATUS.md` alone.

Then produce a brief (≤ 8 lines) summary covering:

- What was being worked on in the previous session.
- What is currently blocked and why.
- The objective and acceptance checklist of the in-progress issue, if one was loaded.
- What the next priority should be, based on `CURRENT_STATUS.md` + `ROADMAP.md`.

Stop after the summary. Do not begin implementing anything until the user gives you a
specific task.
