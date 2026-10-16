---
name: session-close
description: "Close a nemo session: update docs/CURRENT_STATUS.md, capture corrections in CONVENTIONS, propose ADRs for informal decisions, run the local gate, and produce a PR-ready summary. Invoke explicitly before ending every working session."
disable-model-invocation: true
metadata:
  token-budget: "~500–1,000 (plus the local gate's output)"
---

Run the CFD session-close ritual. It is non-negotiable: `docs/CURRENT_STATUS.md`
is the only thing the next session reads to know where work was left.

**Review first (solo).** The maintainer reviews their own work, so `/review-pr`
runs BEFORE this skill — on the local diff when no PR exists yet — and its
findings are fixed now, while the context is loaded. If that has not happened and
there is code on the branch, say so and offer to run it first.

Do ALL of the following:

1. **Update `docs/CURRENT_STATUS.md`** (gitignored, local-only; create it if
   absent):
   - Move finished items from "In Progress" to "Recently Completed" (link the
     issue/PR).
   - Add new items uncovered this session, with enough sub-state to resume cold
     ("task + tests done, CLI wiring missing").
   - Update "Known Issues" / blockers.
   - Re-rank "Next Priorities" (ROADMAP rows).
   - Set "Last updated" to today.

2. **Capture lessons.** A clarified convention or a corrected pattern goes into
   `docs/CONVENTIONS.md`; a significant decision made informally (chat, review,
   in passing) → propose `/new-decision` before closing. Never leave a lesson only
   in chat.

3. **Keep the tracker honest.** Tick the issue's landed AC items or comment its
   progress (`gh issue comment <n>`) — the issue is the shared state; the status
   file is local.

4. **Sanity-check the tree:**

   ```bash
   pnpm build && pnpm lint && pnpm test && pnpm format:check
   git status
   ```

   Record anything red in `CURRENT_STATUS.md` so the next session inherits it.

5. **Stage tracked docs with the code.** `CONVENTIONS.md`, ADRs,
   `vector-contract/*.md` ship in the SAME commit as the code that motivated them.
   `ROADMAP.md` bookkeeping is its own commit (CONVENTIONS "Commits & PRs").

Then output a one-paragraph summary suitable for the PR description: a
Conventional-Commits title + a body mapping to the issue's acceptance criteria.
English; NO AI attribution anywhere.

Stop after the summary. Do not start new work.
