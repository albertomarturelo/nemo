# @albertomarturelo/nemo-mcp

`nemo-mcp` — an [MCP](https://modelcontextprotocol.io) server (stdio) for the
**Vector Capital** broker portal (Chile). It gives Claude Desktop and Claude Code
the routine reads an account owner performs by hand: check the session, browse
instruments, inspect the cartera. Every tool is a thin call into
[`@albertomarturelo/nemo-core`](../core), which owns token renewal, the audit
receipt, and credential handling.

> ⚠️ Unofficial. Not affiliated with, endorsed, or sponsored by Vector Capital
> S.A. Corredores de Bolsa. Provided "as is" (MIT). Use it against your own
> account only. See the repo root README for the full disclaimer.

## Install

Requires Node.js >= 20. Clients launch the server with `npx`, so there is no
separate install step. Sign-in needs a browser: Playwright's Chromium
(`npx playwright install chromium`) or an installed Google Chrome.

**Claude Desktop** — add it to `claude_desktop_config.json` and restart Desktop:

```json
{
  "mcpServers": {
    "nemo": {
      "command": "npx",
      "args": ["-y", "@albertomarturelo/nemo-mcp"]
    }
  }
}
```

**Claude Code:**

```bash
claude mcp add nemo -- npx -y @albertomarturelo/nemo-mcp
```

## Tools

| Tool                        | What it does                                                    |
| --------------------------- | --------------------------------------------------------------- |
| `auth_login`                | Sign in on Vector's own page in a browser window (no arguments) |
| `auth_status`               | Session state and any login block (local read)                  |
| `auth_logout`               | Drop the cached token                                           |
| `instruments_local`         | Chilean instruments, paged                                      |
| `instruments_international` | International (US-listed) instruments, paged                    |
| `instrument_prices`         | ~1y daily price history of a local instrument, with stats       |
| `cartera_summary`           | Holdings with computed P&L and totals by classification         |
| `cartera_movements`         | Cash movements over a date range, classified per kind           |
| `cartera_saldo`             | Cash balance per caja at a date, valued in one currency         |

Resources: `nemo://session` (local session state) and `nemo://config` (the
portal base URL and observed endpoints). Every tool returns JSON. A failure comes
back as an `isError` result whose text is `{ "error", "type" }`: the message is
Vector's, unchanged, and `type` is a stable kind (`not_authenticated`,
`session_expired`, `rate_limited`, `api_error`, …) that never changes name.

## Sign-in and credentials

No tool takes a password or a username. `auth_login` opens a browser window at
Vector's own sign-in page; you type your credentials **there**, and the server
keeps only the bearer token from the portal's response, cached in a per-user
file under `~/.nemo/`. The password never reaches the model or this process.
To keep the state somewhere else, set `NEMO_HOME` to an absolute path in the
server's `env`. The CLI reads the same variable, so set it for both.

`auth_login` waits up to 5 minutes for you to finish. If your MCP client gives
up on the call sooner, the sign-in still completes and the token is still
cached: ask again and the session is active. The session is shared with the
`nemo` CLI, so `nemo auth login` works too. One catch: nemo never learns which
account a browser sign-in used, so over a live `auth_login` session
`nemo auth login` asks you to run `nemo auth logout` first.

## See also

- [`@albertomarturelo/nemo-cli`](../cli) — the `nemo` terminal client over the
  same core.
- [`@albertomarturelo/nemo-core`](../core) — the shared domain library.
- [Architecture](../../docs/ARCHITECTURE.md) and the decision records under
  [`docs/decisions/`](../../docs/decisions/).
