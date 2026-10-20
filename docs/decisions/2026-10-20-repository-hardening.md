# Repository hardening — a reviewed `main`, immutable release tags, pinned actions

## Status

Accepted — 2026-10-20. Builds on ADR-012 (public repository) and the release flow of
ADR-014 / ADR-015. The GitHub-side settings below were applied on this date; this
record is their source of truth, since nothing in the repo or CI can see them.

## Context

The repository is public. Anyone can open a PR, and a published package is one tag
push away from `NPM_TOKEN`. Until now `main` had no protection: a direct or forced
push, a deleted or moved release tag, an unreviewed workflow change or a committed
secret would all have gone through. The workflows referenced actions by mutable tag
(`@v4`), so a compromised upstream tag would run inside CI and the publish jobs. The
project has one maintainer, so any rule that needs a second person must leave that
person a way to merge.

## Decision

- **`main` changes only through a PR** (ruleset "main: PR-only, reviewed, green"):
  - no deletion, no force push, linear history, signed commits;
  - 1 approving review from a code owner (`.github/CODEOWNERS`); a new push dismisses
    it, the last pusher cannot approve, and every review thread must be resolved;
  - the two CI jobs must pass on a branch up to date with `main`, and CodeQL must
    report no security alert of `high` or above and no error;
  - squash is the only merge method; the commit takes the PR title and body.
- **The admin role may bypass, only through a PR** (`bypass_mode: pull_request`). The
  owner merges their own PR with `gh pr merge <n> --squash --admin`, after CI is
  green; nobody can push to `main` directly.
- **Release tags are immutable and admin-created.** For `core-v*`, `cli-v*`, `mcp-v*`
  and the legacy `v*`: one ruleset forbids update and deletion with no bypass, and
  another lets only the admin create them.
- **`NPM_TOKEN` is reachable only from `core-v*`, `cli-v*` and `mcp-v*`** (the
  `npm-publish` environment's tag policy; the legacy `v*` entry was removed).
- **Security features are on:** secret scanning with push protection, Dependabot
  alerts and security updates, CodeQL default setup, and private vulnerability
  reporting (the channel `SECURITY.md` names).
- **Actions are restricted:** only GitHub-owned actions and `pnpm/action-setup`;
  `GITHUB_TOKEN` is read-only by default and cannot approve PRs; a PR from any
  outside contributor runs CI only after the owner approves the run.
- **Every `uses:` is pinned to a full commit SHA**, with the version in a comment.
  Dependabot (`.github/dependabot.yml`) proposes weekly, grouped updates for `npm`
  and `github-actions`, so pins do not rot. Once the workflows are pinned, the
  Actions setting that requires SHA pinning is turned on.

## Alternatives Considered

1. **Classic branch protection instead of rulesets.** Rejected: it cannot protect
   tags, cannot restrict the bypass to PRs, and cannot restrict merge methods.
2. **No required approval (PR-only, 0 reviews).** Rejected: a public repo invites
   outside PRs, and a required code-owner approval is what keeps one from merging
   on green CI alone. The owner's bypass covers the single-maintainer case.
3. **An admin bypass that is always on.** Rejected: it would let a stolen admin
   token push straight to `main`. With PR-only bypass, every change still leaves a
   PR, CI runs and an audit trail.
4. **A required reviewer on the `npm-publish` environment.** Deferred: tag creation
   is already admin-only and tags are immutable, so it adds a manual step to every
   release for little extra gain with one maintainer. Revisit with a second one.
5. **Keep action tags (`@v4`).** Rejected: a tag can be moved upstream, and the
   publish jobs hold `NPM_TOKEN`.

## Consequences

- **Easier:** a leaked secret is stopped at push; a release tag, once pushed, always
  names the code that was published; a malicious PR cannot run with secrets or
  reach `main` without the owner.
- **Harder:**
  - The owner's own PRs merge with `--admin`; a teammate's PR needs the owner's
    review.
  - A wrong release tag cannot be deleted or moved; the fix is a new patch version
    (or disabling the ruleset on purpose, which leaves a trace).
  - A new action needs a SHA pin and, unless it is GitHub-owned, an entry in the
    allowed list.
  - A renamed CI job breaks the required checks until the ruleset is updated in the
    same change.
- **Not available on the free plan:** secret scanning's generic patterns and
  validity checks need GitHub Secret Protection, so they stay off.
- **Obligation:** these settings live in GitHub, not in the repo. A change to any of
  them updates this ADR (or supersedes it) in the same session.
