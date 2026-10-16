# Changelog — @albertomarturelo/nemo-cli

All notable changes to the CLI package are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/) and the project uses
[Semantic Versioning](https://semver.org/).

## [0.3.0] — 2026-10-16

### Added

- `nemo auth login --browser` — sign in on Vector's own page in a browser window;
  only the bearer token is cached and the password never enters nemo. The hidden
  prompt stays the default. Needs Playwright's Chromium
  (`npx playwright install chromium`) or an installed Google Chrome.

## [0.2.0] — 2026-07-31

### Added

- `nemo cartera saldo [--account-id] [--currency] [--fecha]` — the cash balance
  of every caja at a date, valued in one currency, with a grand total.

### Changed

- Requires `@albertomarturelo/nemo-core` >= 0.2.0, which is where `carteraSaldo`
  lands.

## [0.1.0] — 2026-07-26

First published release. The CLI was previously `private` and reachable only
from a monorepo checkout (ADR-015).

### Added

- `nemo` binary published as `@albertomarturelo/nemo-cli` — installable with
  `npm i -g @albertomarturelo/nemo-cli` on Node >= 20.
- `auth` subtree: `login` (hidden password prompt, caches only the bearer
  token), `status` (local read), `logout` (ADR-005 / ADR-006).
- `instruments` subtree: `local`, `international`, and `prices` (~1y daily
  history with stats + sparkline).
- `cartera` subtree: `summary` (holdings with computed P&L and totals by
  classification) and `movements` (cash movements classified per kind).
- JSON output by default with `--human` for readable text; results on STDOUT,
  diagnostics on STDERR (ADR-010).
- Exit-code contract: `2` not authenticated / session expired, `3` login
  failed, `1` otherwise.
