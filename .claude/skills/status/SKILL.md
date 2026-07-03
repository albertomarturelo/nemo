---
description: Summarise the current nemo monorepo status by reading docs/CURRENT_STATUS.md and the ADR index. Use when the user asks "where are we", "what is the status", "what is in progress", or for a quick CFD status read.
---

A lightweight "where are we" — no full session-start ritual, no source scan.

Read:

1. `docs/CURRENT_STATUS.md` (local-only working state; may be absent in a fresh clone).
2. `docs/ROADMAP.md` — the surface checklist (what is ✅ vs ⬜).

Then output a ≤ 6-line summary: what is in progress, what is blocked, and the next
one or two ROADMAP rows to pick up. Do not read source or start work.
