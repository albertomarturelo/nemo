---
description: Pick up a nemo GitHub Issue as the focus of this session — fetch it, parse its fixed CFD sections, pre-load the ADRs it names, skim the pattern to mirror, and summarize the objective and acceptance checklist without scanning target files. Use when the user says "start issue", "work on issue", or passes an issue number. Implements CFD (ADR-001).
---

Pick up a GitHub Issue as the session's focus without re-discovering intent from
code (ADR-001).

Steps:

1. **Fetch the issue.** The user passes a number; otherwise list open work:

   ```bash
   gh issue view <n> --json number,title,body,labels
   # or, to choose: gh issue list --state open
   ```

2. **Parse the fixed CFD sections** from the body: `Context`, `Target`, `ADRs to
   load`, `Acceptance criteria`, `Reproduction` (fixes), `Estimated sessions`.

3. **Pre-load context, not target code.** Read each ADR named under "ADRs to load"
   from `docs/decisions/`. Read the "Pattern to mirror" file named under Target so
   you know the shape to copy. Do **not** read the Target files that will be
   *written* — that is where the work goes, not where context comes from.

4. **Confirm scope.** If "Estimated sessions" is > 1, propose the slice you will do
   this session. If the issue names a decision that isn't an ADR yet, STOP and run
   `new-decision` first.

5. **Summarize** (≤ 8 lines): the objective, the acceptance checklist, the ADRs in
   play, and the file(s) you will create/edit. Then wait for the user's go-ahead
   before implementing.
