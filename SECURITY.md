# Security Policy

## Reporting a vulnerability

Please report security issues **privately** — do NOT open a public issue.

Use GitHub's private vulnerability reporting:
**Security → Advisories → Report a vulnerability** on this repository. Include a
description, reproduction steps, and the impact. You will get an acknowledgement as
soon as possible.

## Security posture

- **Credentials never touch disk and never reach the LLM.** The account password
  is entered at a hidden CLI prompt (`nemo auth login`) — never a flag, env var, or
  argument — held in memory for one `SignIn`, then discarded. Only the resulting
  bearer token is cached, in a per-user file under `~/.nemo/token.json`
  ([ADR-006](docs/decisions/006-credentials-cli-only-never-mcp.md)).
- **No sign-in over MCP.** The MCP server has no credential-taking tool; the
  password cannot cross the model boundary. This is a structural guarantee (the
  `login` task is exported only from `@albertomarturelo/nemo-core/cli`, which the MCP package
  never imports) — CI and `server.test.ts` enforce it.
- **Revoke a local session** anytime with `nemo auth logout` (or delete
  `~/.nemo/token.json`).
- **Least data.** The tool calls only endpoints reachable from the official web UI,
  under your own session, and never redistributes data.

## Handling secrets in the repo

- Never commit `.env`, anything under `.nemo/`, or a real bearer token — `.gitignore`
  blocks them; re-verify before any `git add`.
- Never commit real account PII (email, holdings, amounts). Tests and
  `docs/vector-contract/` examples use synthetic values only.
- The audit log drops keys matching `password|clave|token|secret|cookie|authorization`
  before writing.
