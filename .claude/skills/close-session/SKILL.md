---
description: Close a CFD session by running the non-negotiable session-close ritual — update docs/CURRENT_STATUS.md, capture any clarified convention or informal decision, and produce a PR-ready summary. Use when the user says "close session", "wrap up", "we're done for today", or invokes the CFD session-close ritual. Implements CFD (ADR-001).
---

Run the Context-First Development session-close ritual. This is non-negotiable:
`docs/CURRENT_STATUS.md` is the only thing the next session reads to know where work
was left, so skipping it breaks the loop (ADR-001).

Steps:

1. **Update `docs/CURRENT_STATUS.md`** (create it if absent — it is gitignored,
   local-only). Record:
   - What was done this session (link the issue/PR if any).
   - What is still pending / in flight.
   - Any blocker discovered, with enough detail to resume cold.
   - The suggested next priority (a ROADMAP row).
   Set the "Last updated" date to today.

2. **Capture lessons.** If a convention was clarified or a rule was violated and
   corrected, write it into `docs/CONVENTIONS.md` — or, if it warrants weighing
   alternatives, run the `new-decision` skill for a new ADR. Never leave the lesson
   only in chat (corrections become conventions, ADR-001).

3. **Sanity-check the tree before wrapping:**

   ```bash
   pnpm build && pnpm lint && pnpm test && pnpm format:check
   git status
   ```

   Note anything red in `CURRENT_STATUS.md` so the next session inherits it.

4. **Produce a PR-ready summary** (only if there are commits to describe): a
   Conventional-Commits-style title + a short body mapping to the linked issue's
   acceptance criteria. English; NO AI-attribution anywhere (ADR-001).

Stop after the summary. Do not start new work.
