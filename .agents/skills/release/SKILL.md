---
name: release
description: "Cut a nemo release: pick versions per package, bump + date the CHANGELOGs in a release PR, verify the packed tarballs off-workspace, then — only after the user confirms — tag core before cli/mcp, watch the publish, confirm on the registry, and create the GitHub releases. Invoke explicitly when a release is wanted."
argument-hint: "[core|cli|mcp|all] [version]"
disable-model-invocation: true
metadata:
  token-budget: "~2,000–4,000 plus command output"
---

Release `@albertomarturelo/nemo-core`, `@albertomarturelo/nemo-cli` and/or
`@albertomarturelo/nemo-mcp` to public npm. The rules are CONVENTIONS "Releases &
publishing" (ADR-014, ADR-015); this skill is their checklist.

**The first MCP release has an extra gate:** the Claude Desktop `auth_login`
timeout test must have been run and its result recorded in
`docs/CURRENT_STATUS.md`. A real sign-in takes minutes; the client may cut the
call earlier. If it is not done, stop and ask the user to run it.

A published version is permanent: npm never lets the same version be published
twice, and an unpublish breaks every consumer. A bad release is fixed by a NEW
patch release, never by moving a tag or unpublishing.

## 1. Scope

```bash
git switch main && git pull --ff-only && git status --short   # clean, up to date
gh run list --branch main --limit 1                           # CI green on main
git tag --list 'core-v*' 'cli-v*' 'mcp-v*' | sort -V | tail -6 # last released versions
git log --oneline core-v<last>..HEAD -- packages/core          # what changed per package
git log --oneline cli-v<last>..HEAD -- packages/cli
git log --oneline mcp-v<last>..HEAD -- packages/mcp            # no mcp-v* tag yet: first release
```

Each package with changes needs a non-empty `## [Unreleased]` in its
`packages/<pkg>/CHANGELOG.md`. If changes exist but the section is empty or
missing, stop: write the entries first, as their own docs PR.

**Pick the version per package** (pre-1.0 semver): a new capability → MINOR, a
fix only → PATCH. A breaking change is also a MINOR while at 0.x, but call it out
under `### Changed` in the CHANGELOG. The packages version independently. However,
if the CLI or the MCP uses anything new in core, core MUST be released in the same
run. Their `workspace:^` packs as `^<core version>`, so that core version must
exist on npm before either ships. The first MCP release is `0.1.0` (ADR-015
shape).

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
- MCP only: the `version` literal passed to `new McpServer` in
  `packages/mcp/src/server.ts` (advertised in the initialize handshake).
  `server.test.ts` asserts it against `package.json`.
- Core only: the "Tasks" table in `packages/core/README.md` lists every new
  public task, with `(since <version>)`. That README is the npm landing page.

Then run the gate: `pnpm build && pnpm lint && pnpm format:check && pnpm test`.

## 3. Verify the tarballs, not the checkmark

```bash
T=<scratchpad>/release-<version> && mkdir -p "$T/pack"
pnpm --filter @albertomarturelo/nemo-core pack --pack-destination "$T/pack"
pnpm --filter @albertomarturelo/nemo-cli pack --pack-destination "$T/pack"
pnpm --filter @albertomarturelo/nemo-mcp pack --pack-destination "$T/pack"
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
  `^<core version>`; the MCP depends on `@modelcontextprotocol/sdk`,
  `playwright`, `zod` and `^<core version>`.

Install off-workspace into a throwaway PROJECT and run the binary once:

```bash
mkdir -p "$T/proj" && cd "$T/proj" && npm init -y >/dev/null
npm i ../pack/<core>.tgz ../pack/<cli>.tgz ../pack/<mcp>.tgz  # './' or '../' prefix: a bare name is a registry spec
./node_modules/.bin/nemo --version             # == the new CLI version
./node_modules/.bin/nemo auth login --help
# MCP: one initialize round-trip over stdio; serverInfo.version == the new MCP version
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"smoke","version":"0"}}}' \
  | ./node_modules/.bin/nemo-mcp | head -1 | jq .result.serverInfo
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

   If the prefix is missing, stop. The publish job would start and then fail to
   read `NPM_TOKEN`. Ask the user to add it in the UI.

   Then check the token's age. A granular npm write token lives at most 90 days:

   ```bash
   gh api repos/albertomarturelo/nemo/environments/npm-publish/secrets --jq '.secrets[] | "\(.name) \(.updated_at)"'
   ```

   If it is near or past 90 days, have the user rotate it BEFORE tagging. The
   token must be a Granular Access Token with Read and write on both packages
   and **"Bypass two-factor authentication" checked**. The user sets it with
   `! gh secret set NPM_TOKEN --env npm-publish --repo albertomarturelo/nemo`, so
   the value never enters the chat.

2. **Core first.** Tag the release PR's own merge commit, not whatever `main`
   points to now: a later merge must not ride into the release.

   ```bash
   git switch main && git pull --ff-only
   SHA=$(gh pr view <release-pr> --json mergeCommit --jq .mergeCommit.oid)
   git tag core-v<x> "$SHA" && git push origin core-v<x>
   # A tag run reports the tag as its branch. Filter on it, or a freshly pushed tag
   # whose run is not registered yet makes you watch the PREVIOUS release's run.
   until RUN=$(gh run list --workflow publish-core.yml --branch core-v<x> --limit 1 \
     --json databaseId --jq '.[0].databaseId // empty') && [ -n "$RUN" ]; do sleep 5; done
   gh run watch "$RUN" --exit-status
   npm view @albertomarturelo/nemo-core@<x> version   # retry for a few minutes
   ```

   An early 404 from `npm view` is registry lag, not a failure; give it several
   minutes. A green job is not proof. The registry is.

   **If the publish job fails**, read `gh run view "$RUN" --log-failed`:
   - `E404 … PUT` means npm rejected the token (expired or wrong scope). npm
     answers 404, not 403.
   - `EOTP` means the token cannot bypass 2FA.

   Have the user rotate the token as above, then `gh run rerun "$RUN"`. Nothing
   was published, so the tag stays where it is: never delete or move it to retry.

3. **Then the CLI and/or the MCP**, only once core is visible: the same
   commands, on the same `SHA`, with `cli-v<y>`, `publish-cli.yml` and
   `@albertomarturelo/nemo-cli`, or `mcp-v<z>`, `publish-mcp.yml` and
   `@albertomarturelo/nemo-mcp`. A first `mcp-v*` tag needs `mcp-v*` in the
   Environment's tag policy (step 1).

4. **Smoke the published packages** (run from the scratchpad):
   `npx -y @albertomarturelo/nemo-cli@<y> --version`, and for the MCP the
   initialize round-trip from step 3 against `npx -y @albertomarturelo/nemo-mcp@<z>`.

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
- Core before CLI / MCP whenever their core range moves.
- English everywhere, and no AI attribution in commits, tags, PRs, or release
  notes.
- Record what was released and any surprise in `docs/CURRENT_STATUS.md` at
  `/session-close`. A surprise that is a new rule becomes a CONVENTIONS line (and
  a line in this skill) in the same change.
