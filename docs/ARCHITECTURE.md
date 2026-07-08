# Architecture Overview

## The reality of the Vector Capital portal

This shapes every decision — internalize before writing code. (Ported from the
Python `nemo-cli`; first-hand-observed, not assumed.)

1. **There is no official API.** The portal at
   `https://portalclientes.vectorcapital.cl` ships a web UI that talks to its own
   JSON endpoints under `/api`. Those endpoints are internal and may change
   without notice; every one we call is derived from first-hand observation of
   the live portal and cited (ADR-004). No third-party broker library.

2. **One auth mechanism: bearer token.** `POST /publicapi/shared/auth/SignIn`
   with `{ userName, password }` returns a JWT. `GET
   /publicapi/shared/auth/RefreshToken` (with the token in the `Authorization`
   header) mints a fresh one. There is no refresh-token cookie and no OAuth — the
   access token renews itself while it is still valid. Credentials are entered
   interactively and NEVER stored; only the token is cached (ADR-006).

3. **Production-only.** The base URL is a constant in `@albertomarturelo/nemo-core` config;
   never hard-code it elsewhere. No `NEMO_ENV` switch (ADR-004).

4. **Three sub-prefixes.** `/publicapi` (auth), `/shared` (local Chilean
   instruments), `/frontoffice` (international assets, cartera, prices,
   movements). Each caller passes the explicit prefix; the paths live in
   `config.ENDPOINTS`.

## Two surfaces, one core — and where Claude plugs in

```text
nemo/                         # pnpm workspaces, TypeScript project references
├── packages/
│   ├── core/  (@albertomarturelo/nemo-core)   # All domain logic. A Node library. Thin surfaces call its tasks.
│   ├── cli/   (@nemo/cli)     # Human CLI (terminal). Also what Claude Code drives via Bash.
│   └── mcp/   (@nemo/mcp)     # MCP stdio server. The integration point for Claude Code AND Claude Desktop.
├── docs/                     # CFD context layer (this file lives here)
└── .claude/skills/           # CFD skills
```

- **`@nemo/cli`** — the human terminal surface (`nemo …`). Claude Code can also
  invoke it directly through its Bash tool, so the CLI doubles as an AI-usable
  surface inside Claude Code. It is the ONLY surface that can sign in, because
  signing in takes a password (ADR-006).
- **`@nemo/mcp`** — a stdio MCP server. Both **Claude Desktop** (via
  `claude_desktop_config.json`) and **Claude Code** (via `.mcp.json` / `claude
  mcp add`) consume stdio MCP servers, so this one package makes the same reads
  available to AI assistants in both clients. It offers `auth_status`,
  `auth_logout`, and read tools over an **already-established** session — no
  sign-in tool exists, so the password never reaches the model.

Both surfaces are thin: each command / tool is a call into a `@albertomarturelo/nemo-core`
task. Neither reaches past the task layer into the session / HTTP internals —
that is where the token-renewal and audit rails live (ADR-003).

## The core — a Node library with injectable seams

`@albertomarturelo/nemo-core` is a normal Node library; both surfaces run on Node. What it
keeps is a small set of **injectable seams** so unit tests never touch the real
portal, the real filesystem, or the wall clock:

- `HttpClient` — issue an HTTP request (default: a Node `fetch` adapter; tests
  inject a route table). Vector is a plain JSON REST API, so this is a thin HTTP
  client — no browser / Playwright.
- `TokenStore` — persist + read the cached bearer token (default: a JSON file
  under `~/.nemo/`). The token is the only thing that ever lands on disk.
- `Clock` — time, for testable JWT-exp math and pacing.
- `AuditSink` — append the JSONL receipt (default: fs append; secret-looking keys
  dropped).

The core ships default Node implementations (reachable only via the
`@albertomarturelo/nemo-core/node` subpath, ADR-008) and exposes a composition helper
`createNodeRuntime`. Tests inject in-memory fakes (`import { testing } from
'@albertomarturelo/nemo-core'`). This is dependency injection where it pays — testing +
centralizing the auth-renewal rails — not full hexagonal ceremony (ADR-003).

## `@albertomarturelo/nemo-core` module map

| Module | Purpose | Status |
| --- | --- | --- |
| `config` | Base URL + endpoint paths + refresh window (single source of truth) | Done |
| `seams` | `HttpClient` / `TokenStore` / `Clock` / `AuditSink` interfaces + `Runtime` | Done |
| `errors` | `NotAuthenticated` / `SessionExpired` / `LoginFailed` / `ApiError` / `ContractError` | Done |
| `auth/jwt` | Signature-unverified `exp` peek for proactive renewal | Done |
| `auth/service` | `signIn` + `refreshToken` bootstrap calls over the HTTP seam | Done |
| `auth/session` | `request()` — the single authenticated HTTP path (proactive + reactive renew) | Done |
| `tasks/auth` | `authStatus`, `logout` (barrel) + `login` (CLI-only subpath, ADR-006) | Done |
| `tasks/instruments` | `instrumentsLocal` — the first read; the template later reads mirror | Done |
| `tasks/instruments` (prices) | `instrumentPrices` — local daily price history + pure stats/sparkline | Done |
| `tasks/instruments` (intl) | International assets | Planned (ROADMAP) |
| `tasks/cartera` | Cash movements (classified + aggregated) + holdings summary (P&L, totals by classification) | Done |
| `adapters/node` | `FetchHttpClient` / `FileTokenStore` / `SystemClock` / `FileAuditSink` | Done |
| `adapters/fake` | In-memory fakes for the four seams (`testing`) | Done |
| `audit` | `audited()` wrapper — one receipt per task | Done |

## Data flow

```text
human (CLI) / Claude Code (CLI via Bash, or MCP) / Claude Desktop (MCP)
        │
        ▼
  surface package  ──▶  @albertomarturelo/nemo-core tasks  ──▶  auth/session.request()
        │ (wires seams)                              │ (via seams)
        └──────────────▶ default / injected adapters ◀┘
                                │
                                ▼
                     Vector portal (/api)   +   AuditSink (receipt)
```

## Why this split

The rails (token retrieval, proactive + reactive `RefreshToken` renewal, the
audit receipt, "the password never lands on disk / in the model") live in
`@albertomarturelo/nemo-core` and apply uniformly whether a human typed a CLI command, Claude
Code ran the CLI via Bash, or an assistant invoked an MCP tool. A surface that
reaches past the task layer loses those rails.

## External dependencies

Infrastructure libraries only — NO broker-specific third-party code (ADR-004).
See `docs/STACK.md` for the chosen libraries (MCP TS SDK, a CLI framework,
vitest) and their roles.
