---
name: validate-context
description: "Audit nemo's CFD context integrity — CLAUDE.md size/shape, AGENTS.md alias, ADR index sync + completeness + slug uniqueness, skill layout, no duplicated context, English-only model context, CURRENT_STATUS freshness, the local gate — and report PASS/WARN/FAIL with proposed fixes. Use when asked to validate context or audit docs, or before a release."
metadata:
  token-budget: "~2,000–5,000"
---

Audit the CFD context layer. Report a checklist with ✓ / ⚠ / ✗ per item and a
concrete fix for each ✗. Read-only: do not change files unless the user asks.

1. **`CLAUDE.md` is an index, not an encyclopedia.** ⚠ if > 150 lines, ✗ if > 300.
   ⚠ on any `@path` reference: in Claude Code those are EAGER imports that inject
   the whole file every session — use plain links in the Context Map (ADR
   `adopt-cfd-upstream-revisions`). Every link resolves to a real file. ✗ on a
   section with > 10 lines of inlined prose where a link would do (Critical Rules
   are the deliberate exception).

2. **`AGENTS.md` alias.** `test -L AGENTS.md && [ "$(readlink AGENTS.md)" = CLAUDE.md ]`.
   ⚠ if missing; ✗ if it is a regular file (a divergent copy). Fix:
   `ln -sf CLAUDE.md AGENTS.md`.

3. **ADR index integrity.** Every `docs/decisions/[0-9]*.md` (numbered `NNN-*` and
   date-prefixed `YYYY-MM-DD-*`) is listed in `_index.md`, and every link in
   `_index.md` points to a real file. ✗ if two date-prefixed ADRs share a slug —
   the slug is the identity. ✗ if a new `NNN-*` ADR appears after 015, or a
   numbered ADR was renamed. (CI enforces these too — run the same checks.)

   ```bash
   for f in docs/decisions/[0-9]*.md; do grep -q "$(basename "$f")" docs/decisions/_index.md || echo "missing from index: $f"; done
   ls docs/decisions | grep -E '^[0-9]{4}-[0-9]{2}-[0-9]{2}-' | sed -E 's/^[0-9-]{11}//' | sort | uniq -d
   ```

4. **ADR completeness.** Every ADR has `## Status`, `## Context`, `## Decision`,
   `## Alternatives Considered`, `## Consequences`, and is ≤ 100 lines (⚠ above).

5. **Skill layout.** `.agents/skills/<name>/SKILL.md` is canonical and
   `.claude/skills` is a symlink to it (`test -L .claude/skills`); no
   `.claude/commands/`. Each `SKILL.md` has `name` (= folder), `description`, and
   `metadata.token-budget`. The manual-only rituals (`session-start`,
   `session-close`, `issue-new`, `issue-start`, `release`) have
   `disable-model-invocation: true` AND `agents/openai.yaml` with
   `allow_implicit_invocation: false`. Every skill named in `CLAUDE.md` /
   `README.md` exists; no skill cites an ADR that doesn't exist.

6. **Hooks.** `.claude/settings.json` registers the `SessionStart` hook and
   `.claude/hooks/session-start-context.sh` exists and runs
   (`bash .claude/hooks/session-start-context.sh | head`).

7. **No duplicated context.** A rule lives in exactly one place (an ADR or
   CONVENTIONS) and is referenced elsewhere — not copy-pasted. The CFD essay is
   linked, never vendored.

8. **English-only model context.** `CLAUDE.md`, `docs/`, ADRs, `.agents/skills/`,
   code identifiers/comments are English. Spanish domain terms (`nemotecnico`,
   `cartera`) are fine; Spanish prose in model-facing context is not. (`README.md`
   is user-facing Spanish by choice.)

9. **`CURRENT_STATUS.md` freshness.** Gitignored, so use the local file: it exists,
   its "Last updated" is within 2 working days of `git log -1 --format=%cs` (⚠
   beyond, ✗ beyond a week), and it names a concrete next priority. Stale → the
   last `session-close` was skipped.

10. **Convention coverage.** Spot-check 3 source files against
    `docs/CONVENTIONS.md`; propose CONVENTIONS updates for drift (do not apply).

11. **Gate.** `pnpm build && pnpm lint && pnpm test && pnpm format:check` are
    green (offer to run them). A red gate is ✗.

Output the checklist, then a one-line overall verdict.
