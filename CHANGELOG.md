# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/) and the project uses
[Semantic Versioning](https://semver.org/). Per-package changes to the published
core are also tracked in [`packages/core/CHANGELOG.md`](packages/core/CHANGELOG.md).

## [Unreleased]

### Added

- Initial CFD scaffold — a TypeScript pnpm monorepo (`@albertomarturelo/nemo-core` +
  `@albertomarturelo/nemo-cli` + `@nemo/mcp`), a ground-up rewrite of the Python `nemo-cli` with the
  Vector Capital wire knowledge and guardrails ported.
- Shared core with four injectable seams (`HttpClient`, `TokenStore`, `Clock`,
  `AuditSink`) and a Node composition root (ADR-003).
- Auth: bearer-token session with proactive + reactive `RefreshToken` renewal
  (ADR-005); credential-taking `login` is CLI-only (ADR-006).
- First read surface across all three packages: local instruments (`nemo
  instruments local` / `instruments_local`).
- Cartera cash movements (`nemo cartera movements` / `cartera_movements`):
  classified per kind (dividend/buy/sell/commission/cash_in/cash_out) with
  per-nemotécnico aggregates; scaffolds the `cartera` module (#4, renamed from
  `portfolio` per ADR-013).
- Cartera holdings summary (`nemo cartera summary` / `cartera_summary`): current
  holdings valued in a chosen currency (`--currency`,
  `--with-dividends`/`--no-dividends`), each with a computed profit/loss, plus
  totals grouped by classification and a grand total (#3).
- CFD context layer: `docs/` (ARCHITECTURE, STACK, CONVENTIONS, ROADMAP,
  vector-contract) + ADRs 001–011, `.claude/skills/`, and CI with context-integrity
  and surface-boundary guards.
- The CLI is published to npm as `@albertomarturelo/nemo-cli` (renamed from the
  unpublishable `@nemo/cli`); `npm i -g @albertomarturelo/nemo-cli` installs the
  `nemo` binary. Per-package changes are tracked in
  [`packages/cli/CHANGELOG.md`](packages/cli/CHANGELOG.md) (#13, ADR-015).

### Changed

- Release tags are package-prefixed: `core-v*` publishes the library and
  `cli-v*` publishes the CLI, so the two version independently. The pre-existing
  `v0.1.0` tag stays as historical record (#13, ADR-015).
