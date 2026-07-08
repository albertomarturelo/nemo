# Roadmap — nemo (TypeScript)

The single source of truth for "are we there yet?". Every user-facing surface
(CLI verb + MCP tool) gets a row here; tick it ✅ when the work merges. This repo
is a ground-up TypeScript rewrite of the proven Python `nemo-cli`: the Vector
portal wire knowledge and guardrails are **ported**, the code is written fresh.

## Where we're going

One `@albertomarturelo/nemo-core` engine, two surfaces:

- **`@nemo/cli`** — the terminal surface (and what Claude Code drives via Bash).
  The only surface that can sign in (the password is CLI-only, ADR-006).
- **`@nemo/mcp`** — a stdio MCP server, the integration point for **Claude Code**
  AND **Claude Desktop** — read tools over an already-established session.

Together they cover the day-to-day an investor performs against the broker
portal: authenticate, browse instruments, and inspect the portfolio — with a
single cached bearer token and self-renewing session.

## Surface checklist

Each row is one work-unit (issue → ADR if needed → code across core + both
surfaces → tests → docs).

| Capability | `@albertomarturelo/nemo-core` task | `nemo` CLI | `nemo-mcp` tool | Status |
| --- | --- | --- | --- | --- |
| Sign in (password) | `login` (cli subpath) | `auth login` | — (CLI-only, ADR-006) | ✅ |
| Session status | `authStatus` | `auth status` | `auth_status` + `nemo://session` | ✅ |
| Log out | `logout` | `auth logout` | `auth_logout` | ✅ |
| Local instruments | `instrumentsLocal` | `instruments local` | `instruments_local` | ✅ |
| International instruments | `instrumentsInternational` | `instruments international` | `instruments_international` | ⬜ |
| Instrument price history | `instrumentPrices` | `instruments prices` | `instrument_prices` | ✅ |
| Cartera summary (P&L) | `carteraSummary` | `cartera summary` | `cartera_summary` | ✅ |
| Cartera movements | `carteraMovements` | `cartera movements` | `cartera_movements` | ✅ |

The endpoint paths for the ⬜ rows are already in `config.ENDPOINTS` (observed
from the Python `nemo-cli`); each row still needs its wire contract re-observed
and documented under `docs/vector-contract/` before wiring (CONVENTIONS).

## Cross-cutting (not a single surface)

- ⬜ Publish `@albertomarturelo/nemo-core` (npm, personal scope) once the read surfaces land.
- ⬜ Coverage gate in CI (mirror nemo-cli's ≥95%).
- ⬜ `--account-id` / multi-account selection once the portfolio reads exist.
