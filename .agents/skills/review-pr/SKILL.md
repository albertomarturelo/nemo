---
name: review-pr
description: "Review a nemo PR — or the local branch diff before /session-close — against the curated checklist sourced from the ADRs, CONVENTIONS.md, the linked issue's acceptance criteria, and the PR template, instead of re-discovering intent from code. Report findings; do not auto-fix. Use when asked to review a PR, review this branch, or self-review before closing."
argument-hint: "[pr-number]"
metadata:
  token-budget: "~3,000–15,000, scales with the diff"
---

Review a PR against the project's context (ADR-001), not by re-discovering its intent
from code. The agenda comes from the indices; read source to the depth the checklist
demands.

## 1. Identify the PR

The user passes a PR number. If not, infer from the current branch:

```bash
gh pr status --json number --jq '.currentBranch.number'
```

If the branch has no PR yet, this is a **self-review before `/session-close`**:
review the local branch (local mode below). The close ritual commits and the PR
opens afterwards.

## 2. Fetch metadata + diff + commit story

PR mode:

```bash
gh pr view <n> --json baseRefName,headRefName,title,body,labels,commits,closingIssuesReferences
gh pr diff <n>
git log <base>..<head> --pretty=format:%s
```

Local mode (no PR yet):

```bash
git diff main...HEAD      # committed on the branch
git diff HEAD             # not yet committed
git log main..HEAD --pretty=format:%s
```

Take the issue from the `#N` under "In Progress" in `docs/CURRENT_STATUS.md`. Skip
the PR-body / PR-template items; they apply once the PR exists.

## 3. Load the agenda

- `docs/CONVENTIONS.md`
- `docs/decisions/_index.md`, plus every ADR named in the PR body or a linked issue.
- The linked issue body via `gh issue view <issue-n>` if one exists — extract its
  acceptance-criteria checklist and "ADRs to load" list.
- `.github/PULL_REQUEST_TEMPLATE.md` if present.

## 4. Read changed files to the depth the agenda demands

Verify against known rules, not by discovery. In particular confirm the surface
boundary and the credential invariant by reading the changed call sites.

## 5. Apply the checklist

### Public repo — no sensitive data (ADR-012, CRITICAL — check first)

This repository is **public and permanent**. Scan the WHOLE PR — the diff, every
commit, the PR title/body/comments, branch name, and any added test fixture or
`vector-contract` example — and flag as **Critical (block merge)** any:

- credential / password, in any form;
- bearer token / JWT (a `eyJ…` three-segment string) / cookie / session state;
- `.env`, anything under `.nemo/`, `token.json`, `*.pfx` / `*.p12`;
- real account PII — email, RUT/identity, holdings, amounts, order/movement data,
  account ids — including in a "redacted-but-real" response paste.

Tests and docs MUST use synthetic data only. If anything sensitive is present,
the fix is not just "remove it in a new commit" — note that the value must be
rotated and the history rewritten (it is already public once pushed). Confirm the
PR body's "no sensitive data" checkbox is genuinely satisfied, not just ticked.

### Workflow

- Branch `<type>/<slug>`; base `main`; Conventional-Commits English title.
- PR body references `Closes #<n>` when an issue exists.
- **No AI-attribution metadata** anywhere — no `Co-Authored-By:`, no "Generated
  with …" — in any commit or the PR body (ADR-001). Flag any that appear.

### Surface boundary (ADR-003, critical)

- CLI + MCP import `@albertomarturelo/nemo-core` (and only `/node`, plus `/cli` from the CLI).
  No import of a core internal (`auth/session`, `adapters/*`) from a surface.
- Every authenticated portal call in a task goes through `auth/session.request()`;
  no task builds its own `HttpClient` call (except the two `auth/service` bootstraps).

### Credentials (ADR-006, critical)

- No `password`/`clave`-taking MCP tool or input field; `packages/mcp` does not
  import `@albertomarturelo/nemo-core/cli`. The password is only a hidden CLI prompt.

### Conventions (CONVENTIONS.md)

- No hard-coded URL/path outside `config` (ADR-004); new endpoints cited + documented
  under `vector-contract/`.
- New read surface = per-module task + `register<Mod>` / `register<Mod>Tools`, wired
  by ONE appended line each (ADR-007).
- Tasks return plain JSON-serializable objects; the CLI renders via `emit` (ADR-010).

### Types & tests

- `pnpm build` (strict `tsc -b`) is green; explicit return types on public functions;
  no unjustified `any`.
- Tests inject the `HttpClient`/`TokenStore`/`Clock` fakes — no network, no real
  filesystem; `<module>.test.ts` mirrors the source.

### Decisions & docs drift

- Any new significant decision has an ADR in this PR (ADR-001); `_index.md` updated.
  New ADRs are `YYYY-MM-DD-<slug>.md` with a unique slug — no new `NNN-` file, no
  renamed numbered ADR (ADR `adopt-cfd-upstream-revisions`).
- Touched an ADR-described pattern? Its Consequences still hold.
- A clarified convention is captured in `CONVENTIONS.md`.
- `docs/` updates ship in the same commit as the code that motivated them.
- Each acceptance-criteria `[ ]` from the linked issue is implemented; no
  out-of-scope changes.

## 6. Output a structured review

```text
## Critical (must fix before merge)
- <file>:<line> — <issue> — citation: <ADR-N / CONVENTIONS line>. Suggested fix.

## Suggestions (should fix)
- <file>:<line> — <issue> — citation.

## Nits
- <file>:<line> — <issue>.

## Summary
- Overall assessment, AC coverage X/Y, architecture compliance ✓/⚠/✗.
- Tokens consumed: ~<n>k.
```

## Rules

- **Do NOT auto-fix.** Report only. In a self-review the findings are fixed in the
  same session, before `/session-close`, while the context is loaded; after a PR
  review they become the next session's focus.
- If the checklist needs a rule not yet in an ADR or `CONVENTIONS.md`, surface it as
  a finding and propose `new-decision` — do not silently invent it.
