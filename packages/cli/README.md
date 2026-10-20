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
| `nemo auth login --user <email> --password-env <VAR>`       | Unattended sign-in, password from a named env var          |
| `nemo auth login --user <email> --password-stdin`           | Unattended sign-in, password from the first line of stdin  |
| `nemo auth login --browser`                                 | Sign in on Vector's own page in a browser window (\*)       |
| `nemo auth status`                                          | Session state and any login block (local read)             |
| `nemo auth unblock [--user <email>]`                        | Lift a login block after fixing the password (terminal)    |
| `nemo auth logout`                                          | Drop the cached token                                      |
| `nemo instruments local [--search] [--page] [--limit]`      | Chilean instruments, paged                                 |
| `nemo instruments international [--search] [--exchange] …`  | International (US-listed) instruments, paged               |
| `nemo instruments prices --id <idInstrumento>`              | ~1y daily price history with stats + sparkline             |
| `nemo cartera summary [--account-id] [--currency] …`        | Holdings with computed P&L and totals by classification    |
| `nemo cartera movements [--desde] [--hasta] [--account-id]` | Cash movements over a date range, classified per kind      |
| `nemo cartera saldo [--account-id] [--currency] [--fecha]`  | Cash balance per caja at a date, valued in one currency    |

(\*) `--browser` needs a browser: Playwright's Chromium
(`npx playwright install chromium`) or an installed Google Chrome. The password
is typed into Vector's page and never enters `nemo`; only the token is cached.

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

Errors go to STDERR. In JSON mode (the default) an error is one object, and a
script decides by its `type`, never by the message text:

```json
{ "error": "<the message, verbatim>", "type": "session_expired", "exitCode": 2 }
```

The types are `not_authenticated`, `session_expired`, `login_failed`,
`rate_limited`, `api_error`, `contract`, `validation` and `unexpected`. A type is
never renamed; treat an unknown one as `unexpected`.

## State directory

The token and the audit log live in `~/.nemo/`. Set `NEMO_HOME` to an absolute
path to move them, for example when a platform persists only one directory:

```bash
export NEMO_HOME=/workspace/.nemo
```

A relative path, or a quoted `~`, is refused with type `validation`, because a
cron job changes its working directory.

## Credentials

The password comes from exactly one source, named on the command line:

- **The hidden prompt** (the default), for a person at the keyboard.
- **`--password-env <VAR>`**, for a cron job, CI or an agent. You name the
  variable; there is no default name. The CLI removes it from its environment as
  soon as it reads it, so nothing it starts inherits it.
- **`--password-stdin`**, for the same uses: the first line of a pipe or a file
  (`--password-stdin < file`). It refuses a terminal; there, use the prompt. If
  no line arrives within 10 seconds it gives up (type `login_failed`) instead of
  waiting on a pipe that never speaks.

The password is never a flag value or an argument, so it stays out of the shell
history and the process list. No source falls back to another. Both unattended
sources need `--user`, and an error names the source, never the value.

Every login is safe to repeat. If a live session for the same email is cached,
`login` answers `"reason": "already_authenticated"` without reading the password
or contacting Vector:

```bash
nemo auth login --user me@example.com --password-stdin < "$SECRET_FILE"
```

A live session for a different email is an error (type `validation`): run
`nemo auth logout` first. A session from `--browser` counts as different, because
the email is typed on Vector's page and nemo never learns it.

The password is held in memory for a single sign-in, then discarded. Only the
bearer token and its email are cached, in an owner-only file in the state
directory. No credential ever reaches an AI model: the password-taking sign-in is
exported only to this CLI, and the companion MCP server signs in only through the
browser, where the password is typed into Vector's own page.

## Unattended use (cron, CI, agents)

Each failed sign-in brings the account closer to Vector's lockout, so a loop must
never retry a rejected password. nemo enforces that locally:

1. **When Vector rejects a password** (type `login_rejected`), nemo writes a block
   for that email to `login-blocked.json` in the state directory. The file is
   owner-only and holds no secret.
2. **While the block exists,** `--password-env` and `--password-stdin` refuse
   without contacting Vector (type `login_blocked`). A live session still works.
3. **A person lifts it** after fixing the password: a successful sign-in at the
   prompt, or `nemo auth unblock` in a terminal. `unblock` refuses when stdin is
   not a terminal. A `--browser` sign-in does not lift it, since nemo cannot tell
   which account it was.

`nemo auth status` shows any block in `loginBlocked`, so check it first. The loop
for an agent, on each run:

1. Run `nemo auth status`. If `loginBlocked` lists its email, **stop and tell a
   person**.
2. Run the command it needs. On type `session_expired` or `not_authenticated`,
   sign in once and retry the command **once**:

   ```bash
   nemo auth login --user me@example.com --password-stdin < "$SECRET_FILE"
   ```

3. On any other error, **stop and tell a person**. Never retry a sign-in error.

Keep the state directory between runs (`NEMO_HOME`): it holds the session and the
block. If it is lost, the agent forgets the block and could retry a rejected
password. Forbid `nemo auth unblock` in the agent's instructions: the terminal
check stops a cron or a piped command, but not an agent that runs its commands in
a pseudo-terminal.

## See also

- [`@albertomarturelo/nemo-core`](../core) — the shared domain library.
- [`@albertomarturelo/nemo-mcp`](../mcp) — MCP server exposing the same reads
  to Claude Code / Claude Desktop, with a browser sign-in (`auth_login`).
- [Architecture](../../docs/ARCHITECTURE.md) and the decision records under
  [`docs/decisions/`](../../docs/decisions/).
