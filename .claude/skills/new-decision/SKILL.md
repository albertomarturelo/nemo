---
description: Capture a new architecture decision as an ADR file in docs/decisions/ before any implementation code is written. Use when the user is about to make a significant technical choice (stack, pattern, library, boundary) or asks to "document a decision", "open an ADR", or "record this as an ADR". Implements CFD (ADR-001).
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

2. **Pick the next ADR number.** List `docs/decisions/` and choose the next
   zero-padded integer (e.g. if the highest is `011`, the new ADR is `012`).

3. **Write the ADR** at `docs/decisions/<NNN>-<kebab-case-title>.md` using the exact
   five-section template (the headers are mandatory and CI-checked — do not rename
   them or drop any):

   ````markdown
   # ADR-<NNN>: <Title>

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

4. **Update `docs/decisions/_index.md`** by appending a row (preserve alignment).

5. **Stop.** Do not modify source code in this skill. Tell the user the ADR is ready
   and that the next step is to implement it (open an issue with `issue-new`).
