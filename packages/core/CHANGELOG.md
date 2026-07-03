# Changelog — @albertomarturelo/nemo-core

All notable changes to the core package are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Initial CFD scaffold ported from the Python `nemo-cli`. Ports/adapters core
  (ADR-003) with four injectable seams (`HttpClient`, `TokenStore`, `Clock`,
  `AuditSink`) and a Node composition root at `@albertomarturelo/nemo-core/node`.
- Vector Capital portal contract as the single source of truth (`config`,
  ADR-004): base URL + the six observed endpoints.
- Auth: bearer-token session with proactive + reactive `RefreshToken` renewal
  (ADR-005); the password-taking `login` task is exported only from the CLI-only
  `@albertomarturelo/nemo-core/cli` subpath (ADR-006).
- First read task: `instrumentsLocal` (the template later reads mirror).
