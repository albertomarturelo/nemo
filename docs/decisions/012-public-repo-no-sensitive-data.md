# ADR-012: Public repository — no sensitive data in any git/GitHub artifact

## Status

Accepted — 2026-07-03. Reinforces the secrets/PII rules in CONVENTIONS and
SECURITY, and the credential posture of ADR-006, by making the public-repo
constraint an explicit decision with a hard PR gate.

## Context

This repository is **public** (MIT, published on GitHub like the sibling `sii`
and `nemo-cli` projects). It automates a broker portal, so the worst failure mode
is leaking something sensitive into a commit, PR, issue, branch name, code
comment, doc, or test fixture — all of which are world-readable and permanently
indexed the moment they are pushed (deleting later does not un-leak them; it
requires a history rewrite AND rotating the exposed secret). "Nothing sensitive
in a PR" was implied by CONVENTIONS/SECURITY, but a load-bearing public-repo
constraint should be a decision the agent loads and a checklist item the review
enforces, not a footnote.

## Decision

- **Treat the entire repository as public and permanent.** Every commit, PR
  title/body/comment, issue, branch name, code comment, doc, and test fixture is
  world-readable and indexed. Author accordingly.
- **No sensitive data may enter any git/GitHub artifact**, ever:
  - credentials / passwords (the account password, in any form);
  - bearer tokens / JWTs / cookies / session state;
  - `.env` files, anything under `.nemo/`, `token.json`, `*.pfx`/`*.p12`;
  - real account PII — email, RUT/identity, holdings, amounts, order/movement
    data, account ids — whether in code, docs, fixtures, or a redacted-but-real
    response paste.
- **Tests and `docs/` use SYNTHETIC data only.** A `docs/vector-contract/*.md`
  example is a hand-made shape with invented values, never a real response.
- **Enforcement is layered:**
  1. `.gitignore` blocks the secret files; the `AuditSink` redacts secret-looking
     keys (CONVENTIONS).
  2. **PR review has a MANDATORY "public repo / no sensitive data" gate** — the
     `review-pr` skill checklist flags any credential, token, or real PII in the
     diff, commits, PR body, or fixtures; the PR template carries a confirmation
     checkbox the author ticks.
  3. **CI fails** if a secret/credential file becomes tracked, or if a full JWT
     literal appears in tracked non-test source/docs.

## Alternatives Considered

1. **Leave it implicit in CONVENTIONS + SECURITY.** Rejected — those describe
   hygiene, but a public-repo leak is irreversible; it warrants an ADR the agent
   loads for every work-unit and an explicit, non-skippable PR gate.
2. **Make the repository private.** Rejected — public release is intended
   (MIT, learn-in-the-open, like the sibling projects). The right response to
   "public" is explicit discipline, not hiding the code.

## Consequences

- Easier: reviewers and the AI agent have one named, mandatory gate; the
  synthetic-only rule for tests/docs is unambiguous.
- Obligation: every PR is checked for leaks (skill + template + CI); new wire
  contracts are documented with invented values; if a real secret ever lands, the
  response is rotate-then-rewrite-history — so prevention at review time is the
  whole point.
