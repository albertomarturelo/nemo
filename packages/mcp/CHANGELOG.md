# Changelog — @albertomarturelo/nemo-mcp

All notable changes to the MCP server package are documented here. The format
follows [Keep a Changelog](https://keepachangelog.com/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- First public release of the stdio MCP server, published as
  `@albertomarturelo/nemo-mcp` (binary `nemo-mcp`). Launch it from Claude
  Desktop or Claude Code with `npx -y @albertomarturelo/nemo-mcp`.
- `auth_login` — browser sign-in on Vector's own page, with no arguments; only
  the bearer token is cached. Plus `auth_status` and `auth_logout`.
- Read tools: `instruments_local`, `instruments_international`,
  `instrument_prices`, `cartera_summary`, `cartera_movements`, `cartera_saldo`.
- Resources: `nemo://session` and `nemo://config`.
