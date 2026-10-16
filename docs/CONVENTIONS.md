# Conventions

This file grows as real work surfaces patterns (corrections become conventions —
ADR-016). It starts with the load-bearing rules ported from the proven Python
`nemo-cli`, adapted to TypeScript.

## Code style

- TypeScript `strict` everywhere, plus `noUncheckedIndexedAccess` and
  `exactOptionalPropertyTypes`. No `any` without an inline justification; prefer
  `unknown` + narrowing at boundaries.
- ESLint + Prettier are authoritative. Format before commit.
- Comments explain WHY, not WHAT — non-obvious constraints, portal quirks, subtle
  invariants. Never restate the code.
- ESM only (`"type": "module"`). Named exports; avoid default exports.
- **NodeNext modules: relative imports end in `.js`** (e.g. `from
  './session.js'`) so the compiled output runs directly on Node; bare specifiers
  (`@albertomarturelo/nemo-core`, `commander`) stay extensionless. `tsc` errors on a missing
  extension (ADR-009).

## Architecture patterns

- **Single-env (prod) is the contract.** No `NEMO_ENV` switch. The base URL and
  endpoint paths are constants in `@albertomarturelo/nemo-core` config; never hard-code a URL
  anywhere else (ADR-004).
- **Surfaces call `@albertomarturelo/nemo-core` tasks only.** CLI and MCP never reach past the
  task layer into `auth/session` or an adapter — that bypasses token renewal and
  the audit receipt. CI enforces this with a surface-boundary grep (ADR-003).
- **The core is the data layer; surfaces present. JSON is the default output.**
  `@albertomarturelo/nemo-core` tasks return plain, JSON-serializable objects (no `Date` /
  `Map` / `Set`, no human formatting) — that is the library / integration
  contract. The MCP surface emits `JSON.stringify`; the CLI emits JSON by DEFAULT
  (`--human` for readable text). A command computes its result once and renders it
  through the shared `emit(data, humanFn)`. STDOUT carries only the result (JSON
  pipeable to `jq`); diagnostics go to STDERR (ADR-012).
- **External dependencies sit behind injectable seams.** `HttpClient`,
  `TokenStore`, `Clock`, `AuditSink` are interfaces in `@albertomarturelo/nemo-core` with Node
  defaults; tests inject fakes so they never touch the real portal / filesystem /
  clock. The core is otherwise a normal Node library (ADR-003).
- **Every authenticated portal call goes through `auth/session.request()`.** That
  function owns token retrieval, the proactive renewal (`RefreshToken` when the
  cached token is within `PROACTIVE_REFRESH_SECONDS` of `exp`), and the reactive
  401-refresh-once flow. Calling the `HttpClient` seam directly from a task
  bypasses re-authentication and causes silent failures when tokens expire. The
  ONLY exceptions are the two bootstrap calls in `auth/service` (`signIn`,
  `refreshToken`). On renewal failure `request()` clears the token and raises
  `SessionExpiredError` ("run `nemo auth login`") — it never re-signs-in, because
  there are no stored credentials (ADR-005 / ADR-006).
- **Authentication is an explicit verb, not a side-effect.** Domain tasks never
  mint a session; they consume a cached token via `request()` or raise
  `NotAuthenticatedError`. Only the sign-in tasks mint: `login` (CLI-only) and
  the credential-free `browserLogin` (ADR `mcp-browser-login`).
- **The password never enters the main barrel.** `login` (credential-taking) is
  exported ONLY from `@albertomarturelo/nemo-core/cli`. The MCP server imports the main
  barrel, so it physically cannot wire a credential-taking task; its only sign-in
  is `browserLogin`, which takes no input at all. CI greps for both the
  subpath import in `packages/mcp` and any `password`/`clave` MCP input field
  (ADR-006).
- **Validate MCP tool inputs with `zod` at the boundary (ADR-011).** The SDK
  derives the protocol JSON Schema from the zod shape. Validation stays at the MCP
  edge — internal domain types are plain TypeScript, never zod.

## Broker domain rules

- **No third-party broker libraries.** Every endpoint, param name, and response
  field is derived from first-hand observation of the live portal and cited in a
  code comment, e.g. `// observed at <URL> on <YYYY-MM-DD>` (ADR-004).
- **Wire parsing is defensive + curated.** Validate the envelope shape (`typeof`
  / `Array.isArray`), then project each row into a curated, alias-tolerant shape
  with `asStr` / `asInt` / `asOptionalStr` helpers (a missing field becomes an
  empty/zero/`null`, never a crash). A shape that cannot be found at all raises
  `ContractError` ("the contract drifted") — never retry, re-observe. Capture a
  redacted real response in `docs/vector-contract/<surface>.md` before integrating
  a new endpoint; do NOT assume field names from external docs.
- **Pass the portal's error messages through unchanged.** A non-2xx from a read
  raises `ApiError(status, verbatimBody)`; the CLI surfaces it, the MCP wraps it
  as an `isError` result with the text intact. Opaque translations waste the
  user's time.
- **Never retry after an auth block.** A failed renewal clears the token and
  stops; the user re-runs `nemo auth login`.
- **Domain read surfaces own a per-module file + a register fn (no barrel
  churn).** Each module ships `cli/src/commands/<mod>.ts`
  (`register<Mod>(program, runtime)`) and `mcp/src/tools/<mod>.ts`
  (`register<Mod>Tools(server, runtime)`); `program.ts` / `server.ts` call it from
  ONE append-only line. `instruments` sets the pattern (ADR-007).

## Security, secrets & PII

- **This repository is PUBLIC and permanent (ADR-012).** Every commit, PR, issue,
  branch name, code comment, doc, and test fixture is world-readable and indexed
  the moment it is pushed — deleting later does not un-leak it. Nothing sensitive
  goes into any git/GitHub artifact: no credentials/passwords, no bearer
  tokens/JWTs/cookies, no `.env` / `.nemo/` / `token.json`, and no real account
  PII (email, RUT, holdings, amounts, order/movement data, account ids). Tests and
  `docs/vector-contract/` use SYNTHETIC data only. This is a mandatory PR-review
  gate (`review-pr` skill + PR-template checkbox) with a CI backstop.
- **Credentials never touch disk and never reach the LLM.** The password is
  entered at a hidden CLI prompt (`readline` with echo muted) — never a flag, env
  var, or argument (no shell-history / argv / process-list leak) — held in memory
  for one `signIn`, then discarded. Only the resulting bearer token is cached, in
  a per-user JSON file under `~/.nemo/`. No MCP tool accepts a password (ADR-006).
- **Never commit** `.env`, anything under `.nemo/`, or a real bearer token.
  `.gitignore` blocks them — re-verify before any `git add`.
- **Audit every state-touching op** via the `AuditSink`: `{ ts, action, result,
  durationMs?, ...extra }`. Keys whose name matches
  `password|clave|token|secret|cookie|authorization` are dropped before the line
  is written. The log is a receipt, never a gatekeeper — write failures degrade
  silently.
- **PII hygiene.** Real account data (email, holdings, amounts, real
  nemotécnicos tied to a person) never lands in a tracked file or a test fixture.
  Tests use synthetic values only.

## Testing

- Tests must NOT hit the production portal. Every test injects the in-memory
  `HttpClient` fake; the token store and clock are fakes too.
- Reproduce CI conditions before pushing (no ambient credentials needed — there
  are none).
- Mirror the `src/` tree: `<module>.test.ts` beside the module (vitest).

## Naming

- Files: kebab-case `.ts` modules. Tests: `<module>.test.ts`.
- Domain terms stay in Spanish where they are Spanish (`nemotecnico`,
  `cartera`, `movimientos`). Don't anglicize broker terminology.
- User-facing surfaces (CLI verbs, MCP tool names) are English where no
  entrenched Spanish term exists (`status`, `login`, `instruments`, `auth`),
  Spanish where one does. A **module / command / tool / task name uses the
  entrenched Spanish broker term when one exists and is the ordinary noun for the
  concept** — `cartera` (not `portfolio`), `movimientos`, `nemotecnico`. This does
  not force renaming `instruments` (no more-entrenched Spanish surface noun than
  the shipped English one; ADR-007 keeps it as the structural template regardless).
  See ADR-013.

## Releases & publishing

Run releases through the `/release` skill (`.agents/skills/release/`). It is the
checklist for the rules below and stops for an explicit OK before any tag.

- **`NPM_TOKEN` is a Granular Access Token that expires (≤90 days) and must
  bypass 2FA.** An expired token makes `npm publish` fail with `E404` on the PUT
  (npm hides auth failures as 404); one without the bypass fails with `EOTP`.
  Rotate it before a release when it is near 90 days, and after a failed publish
  rerun the same run: nothing shipped, so the tag stays put. Both surfaced in
  the 0.3.0 release, where the token had been set 99 days earlier.
- **Every published tag gets a GitHub release** whose notes are that version's
  section of the package CHANGELOG, never autogenerated commit lists. It is
  created only after the registry shows the version, so a release never announces
  something that failed to ship.

- **Release tags name their package: `<pkg>-v<version>`** (`core-v0.2.0`,
  `cli-v0.1.0`, and `mcp-v<version>` for the MCP server). Each package versions
  independently — there is no lockstep release. A bare `v*` tag is legacy and means nothing now (ADR-014 / ADR-015).
- **The `npm-publish` Environment's deployment tag policy is the gate**, not the
  workflow trigger. It decides which ref can read `NPM_TOKEN`, so a tag matching
  the workflow but not the policy produces a job that starts and cannot
  authenticate. Update the policy in the SAME change that adds or renames a tag
  prefix — it lives in the GitHub UI, not in the repo, so nothing in CI catches
  a drift.
- **Verify the tarball, not the green checkmark, before tagging.** Run `pnpm
  --filter <pkg> pack`, list its contents, and read the packed `package.json`.
  Two things CI cannot see: files that compile into `dist/` but should never
  ship (test helpers — exclude them in the package's `tsconfig.json`, as
  `packages/cli` does), and `workspace:` dependency ranges, which must appear
  rewritten to real semver (`^0.1.0`) in the packed manifest. Install the
  tarball into a throwaway prefix and run the binary once; that is the only
  check that proves the shebang, `bin` wiring, and dependency resolution work
  off-workspace.
- **A successful publish job is not proof of a published package.** Confirm
  against the registry itself. Expect visibility to lag a publish by minutes —
  an early 404 is not a failure. Note that an anonymous 404 cannot distinguish
  "not there" from "published private", so check while authenticated when it
  matters.
- **A user-visible version literal must be tested against `package.json`.** The
  CLI's `--version` is a literal in `program.ts`; once a package is installable
  it is the only way a user can tell what they have, so a test asserts the two
  agree (`packages/cli/src/program.test.ts`). The MCP server's version, sent in
  the initialize handshake, is guarded the same way
  (`packages/mcp/src/server.test.ts`).
- **Publishing a package that was `private` is a decision, not a chore** — it
  puts command names, flags, exit codes, and output shape under semver. It gets
  an ADR (ADR-015).

## Commits & PRs

- One topic per commit. Conventional Commits subject (`feat(scope): …`),
  ≤72 chars. English everywhere (commits, branches, PRs).
- **One feature / work-unit per PR.** Split before opening the PR. **When work
  is stacked on one branch, still open SEPARATE PRs** — the second PR's base is
  the first branch, so each PR shows only its own diff and closes only its own
  issue. Never one PR spanning two issues (PR #7 merged the `cartera` rename +
  the summary feature together — a mixed PR to avoid).
- **Merging a stacked pair: retarget the top PR BEFORE the base merges.** CI
  runs only on PRs into `main`, so the top PR has no checks while it is stacked.
  Merging the base with `--delete-branch` makes GitHub CLOSE the top PR, and a
  force-push while it is closed makes it impossible to reopen. The order is:
  1. `gh pr edit <top> --base main`;
  2. merge the base;
  3. rebase the top onto `main` with `git rebase --onto main <old-base-tip>`
     and force-push;
  4. let CI run, then merge.

  PR #24 hit both traps and had to be recovered by restoring its old head.
- **Status docs go in a SEPARATE commit from feature code.**
  `CURRENT_STATUS.md` / `ROADMAP.md` bookkeeping is its own commit; the feature
  commit carries code plus its tightly-coupled docs only (the ADR + any
  `vector-contract/*.md`).
- **No AI attribution anywhere** — no `Co-Authored-By`, no "Generated with",
  no `🤖`, in any artifact that lands in git or on GitHub. Authorship is the
  human owner (ADR-022 lineage from nemo-cli).
- `docs/` updates ship in the SAME commit as the code that motivated them.

## Sessions & decisions (CFD)

Upstream CFD revisions adopted by ADR `adopt-cfd-upstream-revisions`.

- **Cite ADRs by their ID as it appears in the index.** Numbered ones stay
  `ADR-007`; date-prefixed ones are cited by slug (`ADR <slug>`). Never assign a
  new sequence number, and never rename a numbered ADR.
- **Restart the session on context signals, not the clock.** First on drift (a
  rejected pattern comes back, an invented convention, losing track of the AC item,
  a mis-cited ADR) — immediately. Then on context fill (long test runs, wide diffs,
  log dumps, auto-compaction) — at the next AC-item boundary. Only when neither
  signal is available, use the clock: soft ~1 h, hard ~2 h. `/session-close` +
  `/session-start` costs ~1.5–3k tokens; drift costs more.
- **Solo self-review comes before close.** Run `/review-pr` on the local diff,
  fix its findings in the same session, THEN `/session-close`, commit, and open
  the PR.
- **One loop by default, the human as orchestrator.** No agent's output feeds
  another agent without a human checkpoint. Parallel loops (one issue, one agent,
  one git worktree each) only with disjoint `Target` paths, every needed ADR
  already merged on `main`, and serial merges with `/review-pr` re-run on the
  rebased branch. A decision surfacing mid-loop lands on `main` as its own PR
  first.
