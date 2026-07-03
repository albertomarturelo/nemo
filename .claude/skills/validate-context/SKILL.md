---
description: Audit CFD context-file integrity — verify CLAUDE.md size, @-references resolve, ADR index consistency, no duplicated context, English-only model context, skill-set consistency, and CURRENT_STATUS.md freshness. Use when the user asks to "validate context", "audit docs", or check whether the CFD scaffolding is healthy.
---

Audit the CFD context layer for integrity. Report findings as a checklist with a
✓/⚠/✗ per item and a concrete fix for each ✗. Do not change files unless the user
asks — this is a read-only audit.

Checks:

1. **`CLAUDE.md` is an index, not an encyclopedia.** ≤ ~150 lines; every `@path`
   reference resolves to a real file. Flag prose that should move into a `docs/*.md`.

2. **ADR index consistency.** Every `docs/decisions/NNN-*.md` on disk is listed in
   `_index.md`, and every link in `_index.md` points to a real file. Every ADR has
   the five mandatory sections (`## Status`, `## Context`, `## Decision`,
   `## Alternatives Considered`, `## Consequences`). (CI enforces this too — run the
   same checks locally.)

   ```bash
   for f in docs/decisions/[0-9]*.md; do grep -q "$(basename "$f")" docs/decisions/_index.md || echo "missing from index: $f"; done
   ```

3. **No duplicated context.** The same rule should live in exactly one place
   (an ADR, or CONVENTIONS) and be referenced elsewhere — not copy-pasted.

4. **English-only model context.** CLAUDE.md, `docs/`, ADRs, `.claude/skills/`, and
   code identifiers/comments are English (ADR-001). Spanish domain terms
   (`nemotecnico`, `cartera`) are fine; Spanish prose in model-facing context is not.

5. **Skill-set consistency.** Every skill referenced in `CLAUDE.md`/`README.md`
   exists under `.claude/skills/`, and each `SKILL.md` has a `description`
   frontmatter. No skill references an ADR number that doesn't exist.

6. **`CURRENT_STATUS.md` freshness.** It exists (local-only), has a recent "Last
   updated" date, and names a concrete next priority. Stale/empty → ⚠ (the last
   `close-session` was skipped).

7. **Config sanity.** `pnpm build && pnpm lint && pnpm test && pnpm format:check`
   are green (offer to run them). A red gate is a ✗.

Output the checklist, then a one-line overall verdict.
