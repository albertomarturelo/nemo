# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/) and the project uses
[Semantic Versioning](https://semver.org/). Per-package changes to the published
core are also tracked in [`packages/core/CHANGELOG.md`](packages/core/CHANGELOG.md).

## [Unreleased]

### Added

- Initial CFD scaffold — a TypeScript pnpm monorepo (`@albertomarturelo/nemo-core` +
  `@nemo/cli` + `@nemo/mcp`), a ground-up rewrite of the Python `nemo-cli` with the
  Vector Capital wire knowledge and guardrails ported.
- Shared core with four injectable seams (`HttpClient`, `TokenStore`, `Clock`,
  `AuditSink`) and a Node composition root (ADR-003).
- Auth: bearer-token session with proactive + reactive `RefreshToken` renewal
  (ADR-005); credential-taking `login` is CLI-only (ADR-006).
- First read surface across all three packages: local instruments (`nemo
  instruments local` / `instruments_local`).
- CFD context layer: `docs/` (ARCHITECTURE, STACK, CONVENTIONS, ROADMAP,
  vector-contract) + ADRs 001–011, `.claude/skills/`, and CI with context-integrity
  and surface-boundary guards.
