# @albertomarturelo/nemo-cli

`nemo` — a terminal client for the **Vector Capital** broker portal (Chile). It
automates the routine reads an account owner performs by hand: check the session,
browse instruments, inspect the cartera. Every command is a thin call into
[`@albertomarturelo/nemo-core`](../core), which owns token renewal, the audit
receipt, and credential handling.

> ⚠️ Unofficial. Not affiliated with, endorsed, or sponsored by Vector Capital
> S.A. Corredores de Bolsa. Provided "as is" (MIT). Use it against your own
> account only. See the repo root README for the full disclaimer.

## Install

```bash
npm i -g @albertomarturelo/nemo-cli
```

Requires Node.js >= 20.

## Quick start

```bash
nemo auth login            # hidden password prompt; caches only the bearer token
nemo auth status
nemo instruments local --search BCI --limit 10
nemo cartera summary --human
```

## Commands

| Command                                                    | What it does                                              |
| ---------------------------------------------------------- | --------------------------------------------------------- |
| `nemo auth login [--user <email>]`                          | Sign in; cache the bearer token                            |
| `nemo auth login --browser`                                 | Sign in on Vector's own page in a browser window           |
| `nemo auth status`                                          | Session state (local read — never touches the network)     |
| `nemo auth logout`                                          | Drop the cached token                                      |
| `nemo instruments local [--search] [--page] [--limit]`      | Chilean instruments, paged                                 |
| `nemo instruments international [--search] [--exchange] …`  | International (US-listed) instruments, paged               |
| `nemo instruments prices --id <idInstrumento>`              | ~1y daily price history with stats + sparkline             |
| `nemo cartera summary [--account-id] [--currency] …`        | Holdings with computed P&L and totals by classification    |
| `nemo cartera movements [--desde] [--hasta] [--account-id]` | Cash movements over a date range, classified per kind      |
| `nemo cartera saldo [--account-id] [--currency] [--fecha]`  | Cash balance per caja at a date, valued in one currency    |

`--help` on any level lists the full flag set.

## Output

**JSON is the default** — the CLI is a faithful façade over the core's data
contract, so it pipes straight into `jq`. Pass `--human` for readable text.
Results go to STDOUT; diagnostics go to STDERR.

```bash
nemo cartera summary | jq '.totals'
```

Exit codes: `0` success, `2` not authenticated (including an expired session),
`3` login failed, `1` anything else.

## Credentials

The password is entered at a hidden prompt — never a flag, environment variable,
or argument — held in memory for a single sign-in, then discarded. Only the
resulting bearer token is cached, in a per-user file under `~/.nemo/`. No
credential ever reaches an AI model: the sign-in path is exported only to this
CLI, which is why the companion MCP server has no login tool.

## See also

- [`@albertomarturelo/nemo-core`](../core) — the shared domain library.
- `nemo-mcp` — MCP server exposing the same reads to Claude Code / Claude
  Desktop over an already-established session.
- [Architecture](../../docs/ARCHITECTURE.md) and the decision records under
  [`docs/decisions/`](../../docs/decisions/).
