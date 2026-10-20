# Changelog — @albertomarturelo/nemo-cli

All notable changes to the CLI package are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/) and the project uses
[Semantic Versioning](https://semver.org/).

## [0.4.0] — 2026-10-19

### Added

- `NEMO_HOME` moves the state directory (token, audit log) to an absolute path.
  A relative one fails with type `validation`.
- `nemo auth login --password-env <VAR>` and `--password-stdin`, for cron, CI and
  agents. Both need `--user` and never fall back to another source. The variable
  is removed from the environment once read, and stdin is refused when it is a
  terminal and given up on after 10 s of silence (ADR `non-interactive-login`).
- The rejection latch. When Vector rejects a password (type `login_rejected`),
  `--password-env` and `--password-stdin` refuse for that email without
  contacting Vector (type `login_blocked`, exit 3), until a person signs in at the
  prompt or runs `nemo auth unblock`.
- `nemo auth unblock [--user <email>]` lifts the block, and refuses without a
  terminal.
- `nemo auth status` reports `loginBlocked`, and `--human` lists each block.

### Changed

- A failure in JSON mode is now `{ "error", "type", "exitCode" }` on STDERR,
  where it was `{ "error" }`. Exit codes are unchanged. Decide by `type`, which
  is never renamed (ADR `non-interactive-login`).
- `nemo auth login` is idempotent. A live session for the same email answers
  `"reason": "already_authenticated"` without asking for the password, and a live
  session for another email (or one from `--browser`) is a `validation` error that
  asks for `nemo auth logout` first. The result gains `reason`.
- A usage error (unknown option, missing argument) is now `{ error, type:
  "validation" }` on STDERR like any other failure. `--browser --user` is a
  `validation` error (exit 1), where it was a login failure (exit 3).

### Fixed

- The package now ships its `LICENSE` (MIT), as core and the MCP server do.

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
