---
name: release
description: "Cut a nemo release: pick versions per package, bump + date the CHANGELOGs in a release PR, verify the packed tarballs off-workspace, then — only after the user confirms — tag core before cli, watch the publish, confirm on the registry, and create the GitHub releases. Invoke explicitly when a release is wanted."
argument-hint: "[core|cli|both] [version]"
disable-model-invocation: true
metadata:
  token-budget: "~2,000–4,000 plus command output"
---

Release `@albertomarturelo/nemo-core` and/or `@albertomarturelo/nemo-cli` to public
npm. The rules are CONVENTIONS "Releases & publishing" (ADR-014, ADR-015); this
skill is their checklist. `@nemo/mcp` is private and not published yet (ROADMAP
cross-cutting row) — skip it.

A published version is permanent: npm never lets the same version be published
twice, and an unpublish breaks every consumer. A bad release is fixed by a NEW
patch release, never by moving a tag or unpublishing.

## 1. Scope

```bash
git switch main && git pull --ff-only && git status --short   # clean, up to date
gh run list --branch main --limit 1                           # CI green on main
git tag --list 'core-v*' 'cli-v*' | sort -V | tail -4         # last released versions
git log --oneline core-v<last>..HEAD -- packages/core          # what changed per package
git log --oneline cli-v<last>..HEAD -- packages/cli
```

Each package with changes needs a non-empty `## [Unreleased]` in its
`packages/<pkg>/CHANGELOG.md`. If changes exist but the section is empty or
missing, stop: write the entries first, as their own docs PR.

**Pick the version per package** (pre-1.0 semver): a new capability → MINOR, a
fix only → PATCH. A breaking change is also a MINOR while at 0.x, but call it out
under `### Changed` in the CHANGELOG. The packages version independently. However,
if the CLI uses anything new in core, core MUST be released in the same run. The
CLI's `workspace:^` packs as `^<core version>`, so that core version must exist
on npm before the CLI ships.

State the plan (packages, versions, why) and wait for the user's OK before
editing.

## 2. Release PR

Branch `chore/release-<version>` (or `chore/release-core-<v>-cli-<v>` when they
differ). For each package being released:

- `packages/<pkg>/package.json` → the new `version`.
- `packages/<pkg>/CHANGELOG.md` → rename `## [Unreleased]` to
  `## [<version>] — <YYYY-MM-DD>`, using today's date.
- CLI only: the `--version` literal in `packages/cli/src/program.ts`.
  `program.test.ts` asserts it against `package.json`.
- Core only: the "Tasks" table in `packages/core/README.md` lists every new
  public task, with `(since <version>)`. That README is the npm landing page.

Then run the gate: `pnpm build && pnpm lint && pnpm format:check && pnpm test`.

## 3. Verify the tarballs, not the checkmark

```bash
T=<scratchpad>/release-<version> && mkdir -p "$T/pack"
pnpm --filter @albertomarturelo/nemo-core pack --pack-destination "$T/pack"
pnpm --filter @albertomarturelo/nemo-cli pack --pack-destination "$T/pack"
tar -tzf "$T/pack/<file>.tgz"                              # contents
tar -xzOf "$T/pack/<file>.tgz" package/package.json | jq '{version,dependencies,peerDependencies}'
```

Check that:

- Only `dist/`, `README.md`, `CHANGELOG.md`, `LICENSE` and `package.json` ship.
- No test helper ships. `dist/adapters/fake` in core is the public `testing`
  export and belongs there.
- No `workspace:` range survives in the packed manifest.
- The dependencies match the ADRs: core has ZERO `dependencies` and only the
  optional `playwright` peer; the CLI depends on `commander`, `playwright` and
  `^<core version>`.

Install off-workspace into a throwaway PROJECT and run the binary once:

```bash
mkdir -p "$T/proj" && cd "$T/proj" && npm init -y >/dev/null
npm i ../pack/<core>.tgz ../pack/<cli>.tgz     # './' or '../' prefix: a bare name is a registry spec
./node_modules/.bin/nemo --version             # == the new CLI version
./node_modules/.bin/nemo auth login --help
```

Install into a project, not `npm i -g core.tgz cli.tgz`. Installing both globally
in one command leaves core as a separate global the CLI resolves to, which is not
a layout real users get, and from there core cannot see the CLI's `playwright`.
Only release from a passing install.

Open the PR: title `chore(release): <version> for <packages>`, the PR template,
and a body that names the tag order. Run `/review-pr`, wait for CI, then
squash-merge with that same subject plus `(#<n>)`.

## 4. Publish — only with the user's explicit go-ahead

Ask: "Merged. Tag `core-v<x>` now (publishes to npm, irreversible)?" Do not tag
without a yes in THIS conversation.

1. **Gate check.** The `npm-publish` Environment's tag policy must allow the
   prefix. It lives in the GitHub UI, not the repo:

   ```bash
   gh api repos/albertomarturelo/nemo/environments/npm-publish/deployment-branch-policies --jq '.branch_policies[].name'
   ```

2. **Core first.** Tag the squash commit on `main`:

   ```bash
   git switch main && git pull --ff-only
   git tag core-v<x> && git push origin core-v<x>
   gh run watch "$(gh run list --workflow publish-core.yml --limit 1 --json databaseId --jq '.[0].databaseId')"
   npm view @albertomarturelo/nemo-core@<x> version   # retry for a few minutes
   ```

   An early 404 is registry lag, not a failure; give it several minutes. A green
   job is not proof. The registry is.

3. **Then the CLI**, only once core is visible: the same commands with `cli-v<y>`,
   `publish-cli.yml` and `@albertomarturelo/nemo-cli`.

4. **Smoke the published CLI:**
   `npx -y @albertomarturelo/nemo-cli@<y> --version` (run it from the scratchpad).

5. **GitHub release per tag**, with notes copied from the CHANGELOG section, never
   autogenerated:

   ```bash
   awk '/^## \[<x>\]/{f=1;next} /^## \[/{f=0} f' packages/core/CHANGELOG.md > "$T/notes-core.md"
   gh release create core-v<x> --title "@albertomarturelo/nemo-core <x>" --notes-file "$T/notes-core.md"
   ```

## Rules

- **Never tag, publish, or create a release without the user's explicit OK** in
  this conversation.
- **Never move, delete or re-push a published tag.** Fix forward with a patch.
- Core before CLI whenever the CLI's core range moves.
- English everywhere, and no AI attribution in commits, tags, PRs, or release
  notes.
- Record what was released and any surprise in `docs/CURRENT_STATUS.md` at
  `/session-close`. A surprise that is a new rule becomes a CONVENTIONS line (and
  a line in this skill) in the same change.
