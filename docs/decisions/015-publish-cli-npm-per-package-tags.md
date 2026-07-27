# ADR-015: Publish `@albertomarturelo/nemo-cli` to npm; per-package release tags

## Status

Accepted — 2026-07-26.

## Context

ADR-014 shipped tag-triggered CD for `@albertomarturelo/nemo-core` and stated
that `packages/cli` and `packages/mcp` stay `private: true` because they are
"not meant to be installed by anyone else". That premise was about the *library*
being the only consumable artifact. It does not survive contact with the actual
product: `nemo-core` is a library nobody runs directly, while `nemo` — the CLI —
is the thing an account owner actually uses. Today the only way to get it is to
clone the monorepo, `pnpm install`, `pnpm build`, and alias a path into
`packages/cli/dist/main.js`. That is a development workflow, not a distribution
channel, and it makes the CLI unusable on any machine that is not a checkout.

Publishing it surfaces a second problem. `publish-core.yml` triggers on `v*` and
asserts that the tag equals `packages/core/package.json`'s version, so a bare
`v*` tag *means* "release core". With a second publishable package that encoding
runs out: `v0.2.0` cannot simultaneously mean core `0.2.0` and cli `0.2.0`
unless the two move in lockstep, which ADR-014 rejected for good reason (version
churn on a package that did not change). The tag namespace has to name its
package. Separately, the current package name is not publishable at all: the
`@nemo` scope is not ours, the unscoped `nemo-cli` is taken on npm by an
unrelated package (v1.2.4), and so is `nemo` (v4.13.1).

## Decision

- **Publish the CLI as `@albertomarturelo/nemo-cli`.** Rename the package from
  `@nemo/cli`, drop `private: true`, and set the initial version to `0.1.0`
  (independent of core's version line — the two are not coupled). The **binary
  stays `nemo`**, so the user-facing command is unchanged: `npm i -g
  @albertomarturelo/nemo-cli` then `nemo auth login`.
- `packages/cli` mirrors `packages/core`'s publish shape: `license`,
  `repository` (with `directory`), `publishConfig` (public, npmjs registry),
  `files: ["dist", "README.md", "CHANGELOG.md"]`, a `prepack` that rebuilds from
  clean, plus `engines.node >= 20` and its own `README.md` (the npm landing page)
  and `CHANGELOG.md`.
- The dependency on the core is declared `workspace:^`, so `pnpm publish`
  rewrites it to `^0.1.0` in the published manifest — a real npm range, not a
  workspace protocol leak, and not an exact pin.
- **Release tags carry a package prefix: `core-v<version>` and
  `cli-v<version>`.** `publish-core.yml` migrates its trigger from `v*` to
  `core-v*`; a new `.github/workflows/publish-cli.yml` triggers on `cli-v*`.
  Each keeps ADR-014's rails unchanged: verify tag/version lockstep before
  publishing, run under the `npm-publish` GitHub Environment, and publish with
  `pnpm publish --no-git-checks --access public` (idempotent).
- **The `npm-publish` Environment's deployment tag policy must list both
  prefixes** (`core-v*`, `cli-v*`). This is the gate that decides which ref can
  read `NPM_TOKEN`; leaving it at `v*` silently breaks both workflows. The
  already-published `v0.1.0` tag stays as historical record and is not re-cut.
- **`packages/mcp` stays `private: true`.** Publishing it is a separate
  work-unit; when it happens it follows this same shape (`mcp-v*`,
  `@albertomarturelo/nemo-mcp`) and needs no new decision.
- **This ADR amends ADR-014** on exactly two points — "only core is published"
  and the `v*` tag scheme. Everything else in ADR-014 (the Environment-scoped
  token, tag/version verification, idempotent publish, no lockstep versioning)
  is reaffirmed, not replaced. ADR-014 stays Accepted as the record of why the
  CD rails look the way they do.

## Alternatives Considered

1. **Keep the CLI private; users clone the repo.** Rejected — this is the status
   quo, and it is the problem. It requires a toolchain (pnpm, a TypeScript
   build) to run a finished tool, and it cannot be installed on a machine that
   is not a development checkout.
2. **Publish unscoped as `nemo-cli` (or `nemo`).** Rejected — both names are
   already taken on npm by unrelated packages. Not a preference; an
   impossibility.
3. **Publish under the `@nemo` scope (`@nemo/cli`, the current name).**
   Rejected — the scope is not owned by this project, so the name is
   unpublishable as written. Claiming an org for a personal tool is
   disproportionate.
4. **Lockstep versioning: one `v*` tag publishes every package.** Rejected again,
   for ADR-014's reason — it forces a version bump (and a release) on a package
   that did not change. Independent versions plus prefixed tags cost one extra
   convention and remove that churn entirely.
5. **Asymmetric tags: core keeps `v*`, the CLI gets `cli-v*`.** Rejected — it
   avoids touching one file today at the cost of a scheme where a bare `v*` tag
   permanently, invisibly means "core". Every future package would have to
   remember the exception. Migrating core to `core-v*` now is a one-line trigger
   change while there is exactly one published package.
6. **Bundle the core into the CLI tarball instead of depending on it.**
   Rejected — it duplicates the published core, decouples the two at exactly the
   layer ADR-003 says must stay shared, and hides which core version a given CLI
   actually runs.

## Consequences

- Easier: `npm i -g @albertomarturelo/nemo-cli` is the whole install story; the
  README stops teaching a clone-and-alias workaround. Releasing either package
  is "bump its `package.json`, tag `<pkg>-v<version>`, push the tag", and the
  two version lines move independently.
- Harder / new obligations:
  - **The CLI now has a public contract under semver** — command names, flag
    names, exit codes, and the default JSON output shape (ADR-010) become things
    a breaking change must justify with a major bump. Previously they were
    internal.
  - The `npm-publish` Environment's tag policy is now load-bearing for two
    workflows and must be updated **before** the first `cli-v*` tag is pushed —
    a manual GitHub-UI step outside this repo, and the most likely failure of a
    first release.
  - Two changelogs to keep honest (`packages/core/CHANGELOG.md`,
    `packages/cli/CHANGELOG.md`) alongside the root one.
  - A breaking change in the core forces a matching CLI release, because the
    published CLI pins `^`-compatible core versions.
  - `v*` and `core-v*` coexist in the tag list forever; `v0.1.0` is a historical
    artifact whose naming no longer matches the convention.
