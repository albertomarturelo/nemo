# Changelog — @albertomarturelo/nemo-core

All notable changes to the core package are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- `classifyError` and the `ErrorType` union: every error maps to a stable `type`
  (`not_authenticated`, `session_expired`, `login_failed`, `rate_limited`,
  `api_error`, `contract`, `validation`, `unexpected`; `login_rejected` and
  `login_blocked` are reserved). A `type` is never renamed (ADR
  `non-interactive-login`).
- `ValidationError`, for a misconfigured command or machine.
- `NEMO_HOME`: an absolute path that replaces `~/.nemo` for the token and the
  audit log. `resolveNemoDir` on `./node` resolves it; `createNodeRuntime` raises
  `ValidationError` for a relative path before touching any file.
  `FileTokenStore` and `FileAuditSink` take the directory as an optional
  constructor argument.

## [0.3.0] — 2026-10-16

### Added

- `browserLogin` — sign in through Vector's own page in a headed browser and
  cache only the bearer token; idempotent over an active session. It takes no
  credential, so it lives on the main barrel (ADR `mcp-browser-login`).
- `BrowserLogin` seam (optional on `Runtime`), its Node default
  `PlaywrightBrowserLogin` on `./node` (lazy `playwright`, an optional peer), and
  `testing.FakeBrowserLogin`.
- `PORTAL_URL`, `WEB_SIGN_IN_PATH`, `BROWSER_LOGIN_TIMEOUT_MS` in config.

## [0.2.0] — 2026-07-31

### Added

- `carteraSaldo` — the standing cash balance of every caja as of a date, valued
  in a chosen currency, plus a grand total. Only `montoConvertido` shares a
  currency across cajas, so only it is summed.

## [0.1.0] — 2026-07-09

First published release, tagged `v0.1.0` — before ADR-015 introduced the
per-package `core-v*` / `cli-v*` tag scheme.

### Added

- Initial CFD scaffold ported from the Python `nemo-cli`. Ports/adapters core
  (ADR-003) with four injectable seams (`HttpClient`, `TokenStore`, `Clock`,
  `AuditSink`) and a Node composition root at `@albertomarturelo/nemo-core/node`.
- Vector Capital portal contract as the single source of truth (`config`,
  ADR-004): base URL + the seven observed endpoints.
- Auth: bearer-token session with proactive + reactive `RefreshToken` renewal
  (ADR-005); the password-taking `login` task is exported only from the CLI-only
  `@albertomarturelo/nemo-core/cli` subpath (ADR-006).
- Read tasks: `instrumentsLocal` (the template the later reads mirror),
  `instrumentsInternational`, `instrumentPrices`, `carteraSummary` and
  `carteraMovements`.
