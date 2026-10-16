---
name: issue-start
description: "Pick up a nemo GitHub Issue as the session's focus: fetch it, parse its fixed CFD sections, load its ADRs and the pattern to mirror, and state the objective + acceptance checklist. Reads existing Target files only if they will be modified. Invoke explicitly with an issue number."
argument-hint: "[issue-number]"
disable-model-invocation: true
metadata:
  token-budget: "~2,000–4,000 (issue + ADRs + 1 reference file)"
---

The user passes an issue number. If not, list open work
(`gh issue list --state open`) and ask which.

1. **Fetch the issue:**

   ```bash
   gh issue view <n> --json number,title,body,labels
   ```

2. **Parse the fixed sections:** `Context`, `Target`, `ADRs to load`,
   `Acceptance criteria`, `Reproduction` (fixes only), `Estimated sessions`. If a
   required section is missing, **STOP**: the issue is malformed. Propose a fix via
   `gh issue edit <n>` — do not infer.

3. **Read each ADR under "ADRs to load"** from `docs/decisions/` (numbered
   `NNN-*.md` or `YYYY-MM-DD-<slug>.md`). They set the constraints.

4. **Read the "Pattern to mirror" file once, for shape.** `instruments` is the
   template read surface (ADR-007). Skim, don't study.

5. **Target files — two cases:**
   - **Net-new files** (`new file`): read nothing at those paths; the pattern is
     the spec.
   - **Existing files being modified** (e.g. `program.ts`, `server.ts`,
     `config/index.ts`): READ each before proposing changes. Editing a file you
     haven't read produces changes that don't fit — that read is correctness, not
     waste.

6. **Confirm scope.** If "Estimated sessions" > 1, the issue should have been
   decomposed: propose splitting now via `/issue-new`, or name the slice for this
   session. If it needs a decision that isn't an ADR yet, STOP and run
   `/new-decision`.

7. **Summarize** (≤ 10 lines): objective (one line), the acceptance checklist
   verbatim, ADRs loaded + what each constrains, target paths, pattern to mirror.
   Then ask: **"Ready to start?"**

Token discipline: do not scan unrelated code or neighbouring modules here.
Everything beyond step 5 waits until implementation surfaces a concrete need.
