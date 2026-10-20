# Non-interactive login — `--password-env` / `--password-stdin`, an idempotent login, a rejection latch

## Status

Accepted — 2026-10-19. **Amends ADR-006**: on the CLI only, the password may also
come from a named env var or stdin; the MCP rules are unchanged. Lineage: `sii`
ADR-028 (with its amendment) and `sii`'s contador-bot. Amended at implementation
(#37): a browser sign-in never clears the latch (see "Cleared by").

## Context

An agent (Grok Bot: a cloud computer, routines, memory) should read the account
on a schedule with nobody at the keyboard. The prompt login needs a TTY,
`--browser` needs a human at Vector's page, and Grok Bot persists only
`/workspace`, so `~/.nemo` is lost when its computer is recycled.

An agent that controls its machine can read any secret its process can. What can
be protected: the password never enters the agent's transcript, a loop never
retries a rejected password into a lockout, and a login happens only when the
session is dead (rare: Vector renews the token, ADR-005).

## Decision

- **Two explicit sources on `nemo auth login`.** Both require `--user`, since
  there is no prompt. They are mutually exclusive with each other and with
  `--browser`. No source falls back to another, and there is no keyring.
  - `--password-env <VAR>`: the name is required and has no default. It must
    match `^[A-Z_][A-Z0-9_]*$`, and the value is deleted from `process.env` right
    after the read. If the variable is missing or empty, the error names the
    variable, never the value, and nothing is sent.
  - `--password-stdin`: reads one line and strips one trailing `\n` / `\r\n`. It
    refuses a TTY (that is the prompt's job) and an empty value.
- **Every credential login is idempotent.** The token store records the
  `username` next to the token. Before reading any password:
  - a cached token for the same user that is outside the proactive-refresh window
    returns `reason: 'already_authenticated'` without calling `SignIn`;
  - a live token for another user, or for an unknown one (from a browser login or
    a token cached before this change), is an error that says logout, then login.
- **The rejection latch: `<NEMO_HOME>/login-blocked.json`** (mode `0600`). It
  holds one entry per user, `{ user, at, status }`, and no secret.
  - **Trips** on any `4xx` from `SignIn` except `429`, from any source, including
    the prompt. Vector's wrong-password response is unobserved
    (`docs/vector-contract/auth.md`), so this errs toward over-blocking. Never
    on a `5xx`, a `429`, a timeout or a network error, where Vector did not judge
    the password.
  - **Effect:** while it exists for a user, the env and stdin logins refuse with
    `LoginBlockedError` (a `LoginFailedError`, exit code 3) **without contacting
    Vector**. The live-token check runs first, so a latched user whose token is
    still alive keeps working.
  - **Cleared by** a fresh successful prompt login for that user, or by
    `nemo auth unblock [--user]`. Not by a browser login: the email is typed on
    Vector's page, so nemo cannot tell whose entry it would clear. `unblock` is
    CLI-only and refuses when stdin is not a TTY. That stops a cron or a piped
    agent, not one running in a pseudo-terminal, so its instructions forbid it.
  - `auth status` reports `loginBlocked: [{ user, at, status }]` on the CLI and
    the MCP. The MCP never lifts it.
- **Errors carry a stable `type`.** `classifyError` in core maps each error to
  `not_authenticated`, `session_expired`, `login_rejected`, `login_blocked`,
  `login_failed`, `rate_limited`, `api_error`, `contract`, `validation` or
  `unexpected`. The CLI writes `{ error, type, exitCode }` on STDERR, and the MCP
  returns `{ error, type }` with `isError: true`. A `type` is never renamed; an
  unknown one means `unexpected`.
- **`NEMO_HOME` overrides `~/.nemo`** (token, audit log, latch); it must be absolute.
- **The rails stay.** Each invocation makes ONE `SignIn` attempt, never retried.
  The password lives in memory for that call only, and nemo never writes it
  anywhere. The tasks stay in `@albertomarturelo/nemo-core/cli`, and **no MCP tool
  gains a password source**. The audit records
  `source: prompt|env|stdin|browser`, and a latch refusal is `result: 'blocked'`.
- **The agent posture lives in `docs/integrations/grok-bot/`** (prompt + skills):
  the password goes through the platform's take-control terminal into a `0600`
  file read only by `--password-stdin`, with `NEMO_HOME=/workspace/.nemo`. A PR
  that changes a command, flag or error `type` updates the pack too.

## Alternatives Considered

1. **Keep ADR-006 as is.** Rejected: no agent can use the prompt or the browser.
2. **`--password <value>` or a positional argument.** Rejected: it shows up in
   `ps`, the shell history and the agent's transcript.
3. **A default variable (`NEMO_PASSWORD`, read implicitly).** Rejected: it can
   pick up a forgotten value. Naming it costs one word.
4. **`--keyring` (as in `sii` ADR-025).** Deferred: Grok Bot and containers have
   no keyring, and it adds a native dependency.
5. **Observe Vector's wrong-password response first.** Deferred: a non-429 `4xx`
   rule is safe without it. Narrow the rule once it is observed.
6. **Store the password and re-SignIn when renewal fails.** Rejected: ADR-005 and
   ADR-006 forbid persisting credentials.

## Consequences

- **Easier:** one idempotent line for an agent, cron or CI run, with no TTY:
  `nemo auth login --user <email> --password-stdin < <file>`.
- **Harder:** the token file gains `username`, so a browser-login token is
  "unknown user" to a credential login. The error `type` is a contract to keep.
- **Residual risk (the operator accepts it):** whoever compromises or
  prompt-injects the agent gets the full password. An env var is inherited by the
  agent's children until the CLI deletes it, and the Grok Bot pack keeps the
  password at rest in a `0600` file on the agent's disk (nemo never writes it).
  Use it only for your own account.
- **Obligations:** fake-env, fake-stdin and fake-HTTP tests for every refusal
  path; CI keeps guarding that `packages/mcp` never imports `/cli`.
