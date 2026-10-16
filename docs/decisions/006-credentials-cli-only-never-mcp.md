# ADR-006: Credentials are CLI-only and never reach MCP

## Status

Accepted — 2026-07-03. Ported from the Python `nemo-cli` (ADR-025 interactive
login, credentials never on disk) and the `sii` project's ADR-006 posture. Amended
by [`mcp-browser-login`](2026-10-15-mcp-browser-login.md): the MCP gains a
credential-free `auth_login` (browser), and Alternative 3 below is reversed.

## Context

Signing in requires the account password. An MCP tool argument is visible to the
model and travels over the MCP channel; a CLI flag/env/argv is visible in shell
history and the process list. Neither is an acceptable place for a password. But
the CLI and MCP both consume the same core barrel, so we need a structural
guarantee — not just discipline — that the password cannot leak.

## Decision

- **The password is entered ONLY at a hidden CLI prompt** (`readline` with echo
  muted). Never a flag, env var, or argument. Held in memory for one `signIn`,
  then discarded. Only the resulting bearer token is cached (`~/.nemo/token.json`).
- **`login` (the credential-taking task) is exported ONLY from the CLI-only
  subpath `@albertomarturelo/nemo-core/cli`** — NOT the main barrel. The MCP server imports
  the main barrel, so it physically cannot wire a sign-in tool.
- **The MCP surface has NO sign-in tool.** It offers `auth_status`, `auth_logout`,
  and read tools over an already-established session. `auth_logout` carries no
  secret (local token wipe), so it is allowed.
- **CI guards both invariants:** it fails if `packages/mcp` imports
  `@albertomarturelo/nemo-core/cli`, or if any MCP tool input schema declares a
  `password`/`clave`/`user`-like field.

## Alternatives Considered

1. **An MCP `auth_login` tool taking `{ user, password }`.** Rejected — puts the
   password in a model-visible tool argument; the whole point is that it never
   reaches the model.
2. **Discipline only (no subpath split).** Rejected — one careless import would
   reintroduce the risk; the subpath split makes the leak a build/CI failure.
3. **A browser-delegated login (like `sii`).** Not applicable — Vector's `SignIn`
   is a direct credential POST, not a browser cookie flow; the hidden prompt is
   the right analogue.

## Consequences

- Easier: the "password reaches the model" risk is structurally impossible for
  MCP; the human CLI has a clean interactive login.
- Obligation: signing in requires the terminal (`nemo auth login`) before MCP
  reads work; the CLI/MCP split of the core barrel must be preserved (CI-guarded);
  read tools return an actionable "run `nemo auth login`" when there is no session.
