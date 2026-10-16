---
name: new-decision
description: "Capture a new architecture decision as an ADR (≤100 lines, real alternatives) in docs/decisions/ before any implementation code is written, then update the index. Use when a significant technical choice surfaces without an ADR (dependency, pattern, boundary, strategy) or when asked to document a decision."
metadata:
  token-budget: "~1,000–2,500 for the whole flow"
---

Help the user document a new architecture decision as an ADR. Do **not** write any
implementation code during this skill — its only output is the ADR file and the
updated index (decisions-before-code, ADR-001).

Steps:

1. **Elicit the decision.** Ask, one focused question at a time, and do not move on
   until you have a crisp one-paragraph answer for each:
   - What problem is being solved? (the *context*)
   - What is the proposed change? (the *decision*)
   - What other options were considered, and why are they rejected?
   - What becomes easier and what becomes harder?

   Propose 2–3 real alternatives with explicit pros and cons — do not short-circuit
   to your favourite; the user chooses. Skipped alternatives get re-litigated by a
   later session.

2. **Pick the slug — never a number.** The file is
   `docs/decisions/YYYY-MM-DD-<slug>.md` (today's date). The slug is the ADR's
   identity: short, specific, kebab-case (`coverage-gate-ci`, not `ci-stuff`).
   Check no file in `docs/decisions/` already ends in `-<slug>.md`; if one does,
   pick another slug or ask whether this supersedes it. Never compute a sequence
   number — parallel branches collide (ADR `adopt-cfd-upstream-revisions`).
   Numbered ADRs 001–015 keep their numbers; never rename them.

3. **Write the ADR** following `docs/decisions/TEMPLATE.md` exactly — the five
   section headers are mandatory and CI-checked; do not rename or drop any:

   ````markdown
   # <Title>

   ## Status

   Accepted — <YYYY-MM-DD>

   ## Context

   <One or two paragraphs describing the problem.>

   ## Decision

   <The decision, stated as imperatives. Concrete file/naming conventions.>

   ## Alternatives Considered

   1. **<Option A>** — <why rejected>.
   2. **<Option B>** — <why rejected>.

   ## Consequences

   <What becomes easier or harder; new risks or obligations.>
   ````

   Keep it ≤ 100 lines. Status starts `Accepted` unless the user asks for
   `Proposed`. If it amends or supersedes an older ADR, say so in Status.

4. **Update `docs/decisions/_index.md`** by appending one row with the slug in the
   ID column. If the decision changes a recurring convention, update
   `docs/CONVENTIONS.md` and cite `ADR <slug>` there.

5. **Stop.** Do not modify source code in this skill. Tell the user the ADR is ready
   and that the next step is to implement it (open an issue with `issue-new`).
