# Changelog — @albertomarturelo/nemo-mcp

All notable changes to the MCP server package are documented here. The format
follows [Keep a Changelog](https://keepachangelog.com/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- `NEMO_HOME` moves the state directory (token, audit log) to an absolute path.
- `auth_status` and `nemo://session` report `loginBlocked`: the emails whose
  unattended CLI sign-in is blocked after Vector rejected their password. No tool
  can lift a block (ADR `non-interactive-login`).

### Changed

- A failing tool's text is now `{ "error", "type" }` (JSON) instead of the bare
  message, still with `isError: true`. The message is unchanged inside `error`
  (ADR `non-interactive-login`).
- With no session, a read's error says "Not signed in" instead of "Session
  expired".
- Over a live `auth_login` session, a CLI sign-in asks for `nemo auth logout`
  first: nemo cannot tell which account the browser used. For the same reason,
  `auth_login` never lifts a login block.

## [0.3.0] — 2026-10-16

### Added

- First public release of the stdio MCP server, published as
  `@albertomarturelo/nemo-mcp` (binary `nemo-mcp`). Launch it from Claude
  Desktop or Claude Code with `npx -y @albertomarturelo/nemo-mcp`.
- `auth_login` — browser sign-in on Vector's own page, with no arguments; only
  the bearer token is cached. Plus `auth_status` and `auth_logout`.
- Read tools: `instruments_local`, `instruments_international`,
  `instrument_prices`, `cartera_summary`, `cartera_movements`, `cartera_saldo`.
- Resources: `nemo://session` and `nemo://config`.
