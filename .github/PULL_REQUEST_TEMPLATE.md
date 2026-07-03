<!-- Keep this template's sections — `/review-pr` parses them. English only. -->

## Summary

<!-- 1-3 sentences: what the PR changes and why. -->

## Public repo — no sensitive data (ADR-012)

<!-- This repository is PUBLIC and permanent. Confirm before requesting review. -->

- [ ] No credentials, bearer tokens/JWTs, cookies, `.env`, `.nemo/`, or `token.json`
      in the diff, commits, PR body, or fixtures.
- [ ] No real account PII (email, RUT, holdings, amounts, order/movement data,
      account ids) anywhere — tests and docs use **synthetic** data only.

## Linked issue

Closes #<!-- N -->

<!-- If no linked issue, replace this section with a justification. Most work
     should track an issue. -->

## Acceptance criteria

<!-- Copy verbatim from the issue body. Tick boxes as items land. -->

- [ ] <!-- behavior -->
- [ ] <!-- tests -->
- [ ] <!-- documentation -->

## ADRs touched

<!-- List the ADRs this PR depends on, supersedes, or amends. If you introduced a
     new decision, link the new ADR file. If none, write "none". -->

- ADR-NNN

## Test plan

<!-- Concrete commands a reviewer can run. Tests must NOT hit the live portal —
     in-memory fakes / synthetic data only (CONVENTIONS.md). -->

```bash
pnpm install
pnpm build        # tsc -b (strict)
pnpm lint
pnpm format:check
pnpm test         # vitest — HttpClient fake, no network
```

## Notes for the reviewer

<!-- Anything non-obvious in the diff, deferred follow-ups, observation sources
     for new endpoints (docs/vector-contract/*.md), etc. -->
