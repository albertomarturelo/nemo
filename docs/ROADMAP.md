# Roadmap — nemo (TypeScript)

The single source of truth for "are we there yet?". Every user-facing surface
(CLI verb + MCP tool) gets a row here; tick it ✅ when the work merges. This repo
is a ground-up TypeScript rewrite of the proven Python `nemo-cli`: the Vector
portal wire knowledge and guardrails are **ported**, the code is written fresh.

## Where we're going

One `@albertomarturelo/nemo-core` engine, two surfaces:

- **`@albertomarturelo/nemo-cli`** — the terminal surface (and what Claude Code drives via Bash).
  The only surface that takes a password (hidden prompt, ADR-006).
- **`@albertomarturelo/nemo-mcp`** — a stdio MCP server, the integration point for **Claude Code**
  AND **Claude Desktop** — browser sign-in (`auth_login`) + read tools.

Together they cover the day-to-day an investor performs against the broker
portal: authenticate, browse instruments, and inspect the portfolio — with a
single cached bearer token and self-renewing session.

## Surface checklist

Each row is one work-unit (issue → ADR if needed → code across core + both
surfaces → tests → docs).

| Capability | `@albertomarturelo/nemo-core` task | `nemo` CLI | `nemo-mcp` tool | Status |
| --- | --- | --- | --- | --- |
| Sign in (password) | `login` (cli subpath) | `auth login` | — (CLI-only, ADR-006) | ✅ |
| Sign in (browser) | `browserLogin` | `auth login --browser` | `auth_login` | ✅ |
| Session status | `authStatus` | `auth status` | `auth_status` + `nemo://session` | ✅ |
| Log out | `logout` | `auth logout` | `auth_logout` | ✅ |
| Local instruments | `instrumentsLocal` | `instruments local` | `instruments_local` | ✅ |
| International instruments | `instrumentsInternational` | `instruments international` | `instruments_international` | ✅ |
| Instrument price history | `instrumentPrices` | `instruments prices` | `instrument_prices` | ✅ |
| Cartera summary (P&L) | `carteraSummary` | `cartera summary` | `cartera_summary` | ✅ |
| Cartera movements | `carteraMovements` | `cartera movements` | `cartera_movements` | ✅ |
| Cartera cash balance | `carteraSaldo` | `cartera saldo` | `cartera_saldo` | ✅ |

All surface rows are wired. Every endpoint path lives in `config.ENDPOINTS` and
each wired surface has its re-observed wire contract documented under
`docs/vector-contract/` (CONVENTIONS). A new surface re-observes before wiring.

## Cross-cutting (not a single surface)

- ✅ Publish `@albertomarturelo/nemo-core` (npm, personal scope) — tag-triggered CD (ADR-014).
- ✅ Publish `@albertomarturelo/nemo-cli` (npm) — `cli-v*` tag-triggered CD; release
  tags are package-prefixed (`core-v*` / `cli-v*`) so the two version
  independently (ADR-015).
- ⬜ Publish `@albertomarturelo/nemo-mcp` (npm) — `mcp-v*` tag-triggered CD, same
  shape as the CLI; needs no new decision (ADR-015). Package + workflow in place;
  the first release (via `/release`) waits on the Claude Desktop `auth_login`
  timeout test.
- ⬜ Coverage gate in CI (mirror nemo-cli's ≥95%).
- ⬜ `--account-id` / multi-account selection once the portfolio reads exist.
