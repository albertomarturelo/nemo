# ADR-014: Publish `@albertomarturelo/nemo-core` to npm via tag-triggered CD

## Status

Accepted — 2026-07-09.

## Context

`nemo-core` now covers every read surface on the ROADMAP (local + international
instruments, price history, cartera summary + movements). The ROADMAP carries a
cross-cutting item — "Publish `@albertomarturelo/nemo-core` (npm, personal
scope)" — that is still open. Today there is no repeatable way to cut a release:
publishing would mean running `npm publish` by hand from a laptop, with no
auditable trail and no guard against a stale or mismatched version going out.
A tag-triggered CD pattern (build on `v*` push, verify tag/version lockstep,
publish idempotently) is a proven, low-risk shape this repo can adopt directly.

## Decision

- Add `.github/workflows/publish-core.yml`, triggered by `push` of `v*` git
  tags. It builds and publishes **`packages/core` only** — `packages/cli` and
  `packages/mcp` stay `private: true` and unscoped (`@nemo/cli`, `@nemo/mcp`);
  this is NOT a lockstep multi-package publish.
- The job verifies the pushed tag matches `packages/core/package.json`'s
  `version` before publishing (`v0.2.0` ⇒ version `0.2.0`); a mismatch fails the
  job with a clear error rather than publishing a stale version.
- `pnpm publish --no-git-checks --access public` is idempotent — retagging or
  re-running against an already-published version is a no-op, not a failure.
- **The `NPM_TOKEN` secret lives in a GitHub Environment** (e.g. `npm-publish`),
  not a plain repo secret, with a **deployment branch/tag policy** restricted to
  `v*` tags. The publish job declares `environment: npm-publish`. This is the
  concrete mechanism that prevents a workflow run triggered from a non-default
  branch or a PR ref from ever reading the token — branch protection alone only
  guards what merges into `main`, not which Actions run can read a secret.
- Repo-level Actions settings are hardened alongside this: workflows triggered
  from a fork/PR ref do not get secret access, and branches are deleted
  automatically on PR merge (housekeeping, not part of the publish gate itself).

## Alternatives Considered

1. **Manual `npm publish` from a maintainer's machine.** Rejected — no
   auditable trail, error-prone version bumps, does not scale.
2. **Lockstep multi-package publish (all three packages move together).**
   Rejected — `cli` and `mcp` are private, unscoped, and not meant to be
   installed by anyone else; forcing all three to move in lockstep adds
   version churn for no benefit since only `core` is a consumable library.
3. **A plain repo-level secret, relying on branch protection only.** Rejected —
   branch protection controls what can merge to `main`; it does not restrict
   which Actions run (e.g. one triggered from a PR branch) can read a
   repo-level secret. A GitHub Environment with a branch/tag deployment policy
   is the actual GitHub-native gate for "only this ref can see this secret."
4. **Publish on every push to `main`.** Rejected — releases must be a
   deliberate act (an explicit version bump + tag), not an automatic side
   effect of merging a PR.

## Consequences

- Easier: cutting a release is "bump `packages/core/package.json` + tag + push
  the tag"; re-running the workflow (retag, rerun) is safe and idempotent;
  consumers get a real `npm install @albertomarturelo/nemo-core`.
- Harder / new obligations: the Environment's tag policy must stay in sync if
  the tag naming convention ever changes; one more piece of repo infrastructure
  (the Environment itself) to configure and remember exists, separate from the
  workflow file.
