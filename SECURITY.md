# Security Policy

## Reporting a vulnerability

Please report security issues **privately** — do NOT open a public issue.

Use GitHub's private vulnerability reporting:
**Security → Advisories → Report a vulnerability** on this repository. Include a
description, reproduction steps, and the impact. You will get an acknowledgement as
soon as possible.

## Security posture

- **nemo never writes the password to disk, and it never reaches the LLM.** The CLI
  takes it from ONE source the command line names, with no fallback between them
  ([ADR-006](docs/decisions/006-credentials-cli-only-never-mcp.md), as amended by
  [`non-interactive-login`](docs/decisions/2026-10-19-non-interactive-login.md)):
  - the hidden prompt (`nemo auth login`), the default;
  - `--password-env <VAR>`, for unattended use: you name the variable, and the CLI
    removes it from the environment once read;
  - `--password-stdin`, for unattended use: one line from a pipe or a file, never a
    terminal.

  Never a password-valued flag or argument. The password is held in memory for one
  `SignIn`, then discarded. With `--browser` it is typed into Vector's own page and
  never enters nemo ([`mcp-browser-login`](docs/decisions/2026-10-15-mcp-browser-login.md)).
- **Only the bearer token and its owner's email are cached**, in an owner-only
  (`0600`) file under `~/.nemo/`, or under `NEMO_HOME` when you set it (an absolute
  path).
- **A rejected password is not retried.** When Vector rejects a password, unattended
  sign-ins for that email refuse without contacting Vector until a person signs in at
  the prompt or runs `nemo auth unblock` in a terminal. A loop cannot walk the account
  into a lockout.
- **No password over MCP.** The MCP server's only sign-in (`auth_login`) opens Vector's
  page in a browser and takes no input. The password-taking `login` task is exported
  only from `@albertomarturelo/nemo-core/cli`, which the MCP package never imports —
  CI and `server.test.ts` enforce it.
- **Revoke a local session** anytime with `nemo auth logout` (or delete the token
  file in the state directory).
- **Least data.** The tool calls only endpoints reachable from the official web UI,
  under your own session, and never redistributes data.

## Handling secrets in the repo

- Never commit `.env`, anything under `.nemo/`, or a real bearer token — `.gitignore`
  blocks them; re-verify before any `git add`. GitHub secret scanning with push
  protection rejects a push that carries a recognised secret.
- Never commit real account PII (email, holdings, amounts). Tests and
  `docs/vector-contract/` examples use synthetic values only
  ([ADR-012](docs/decisions/012-public-repo-no-sensitive-data.md)).
- The audit log drops keys matching `password|clave|token|secret|cookie|authorization`
  before writing.

## Repository protection

`main` changes only through a reviewed pull request with green CI and CodeQL, release
tags are immutable once pushed, and the publish credentials are reachable only from
release tags. The full list of settings is in
[`repository-hardening`](docs/decisions/2026-10-20-repository-hardening.md).
