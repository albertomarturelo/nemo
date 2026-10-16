# Browser login — the MCP can start sign-in; the password goes only to Vector's page

## Status

Accepted — 2026-10-15. Amends ADR-006 (drops "the MCP has NO sign-in tool" and its
Alternative 3; keeps every invariant about the password). Lineage: `sii` ADR-006
(browser cookies-only login). Evidence: `docs/vector-contract/auth.md` § Web login
(headed observation 2026-10-15).

## Context

Today only the terminal can sign in (`nemo auth login`, hidden prompt), so an MCP
client such as Claude Desktop is useless until the user switches to a terminal.
ADR-006 rejected the `sii`-style browser login as "not applicable" because `SignIn`
is a JSON POST rather than a cookie flow. A headed observation of the live portal
proved that wrong: Vector's own SPA (`/sign-in`) makes that same
`POST /api/publicapi/shared/auth/SignIn` and receives the bearer JWT in the
response. No second factor and no captcha are involved, and the token is not kept
in web storage. So a browser we launch can capture the token from that response
while the user types the password into Vector's page, and the password never
crosses our process.

## Decision

1. **New seam `BrowserLogin`** (ADR-003): `signIn({ timeoutMs }): Promise<string>`
   returns the bearer token. Its Node default (`PlaywrightBrowserLogin`) lives in
   the `./node` subpath and lazy-imports `playwright`. The in-memory fake goes in
   `testing`. The main barrel stays free of Playwright.
2. **Mechanism:** open a HEADED browser at `PORTAL_URL + WEB_SIGN_IN_PATH` (both in
   `config`; nothing hard-coded). Wait for the 2xx response to
   `API_BASE_URL + ENDPOINTS.signIn` and take ONLY `token` from its JSON, which
   must be a non-empty string or the call raises `ContractError`. `user` /
   `systemConfig` (PII) are discarded unread. The request body is never read:
   `postData` is never called. The browser closes in `finally`. Timeout or a
   closed window raises `LoginFailedError`, and no partial token is written.
3. **Task `browserLogin(rt)` in the MAIN barrel.** It takes no credentials, so it is
   safe on the barrel the MCP imports. It is idempotent: a cached token that is not expiring
   returns `{ reason: 'already_authenticated' }` without opening a window. On
   success it caches the token through `TokenStore` and is `audited`
   (`auth.login`, `method: 'browser'`, no token).
4. **Surfaces:**
   - The MCP gains `auth_login`, with an EMPTY input schema. It can block for up
     to the 5-minute budget while the user signs in.
   - **The CLI is unchanged.** `nemo auth login` keeps the hidden prompt, and
     `login` (password-taking) stays CLI-only in `@albertomarturelo/nemo-core/cli`.
     A terminal user already has a safe input; the browser solves the MCP's
     problem, not the CLI's.
   - Both CI guards (no `/cli` import from MCP, no `password`/`clave` input field)
     are unchanged.
5. **Browser binary:** Playwright's Chromium first, then an installed Chrome
   (`channel: 'chrome'`). If neither launches, the error names
   `npx playwright install chromium`.
6. **Packaging:**
   - `playwright` is an OPTIONAL peer of core (`peerDependenciesMeta`), mirroring
     `sii` ADR-016.
   - It is a direct dependency of `@nemo/mcp` only; the CLI does not install it.
   - Core keeps zero runtime dependencies.

## Alternatives Considered

1. **Status quo (terminal-only sign-in).** Rejected: it defeats the MCP use case.
   Every expired session forces the user out of Claude Desktop.
2. **An MCP tool that takes the password.** Rejected (ADR-006): the password would
   pass through a model-visible tool argument.
3. **Our own local login page served by the MCP.** Rejected: the password would
   cross our process, and it trains users to type their broker password into a
   page that is not the broker's.
4. **Read the token from the browser instead of the response.** Rejected for now:
   it is not in local/session storage. An httpOnly `access_token` cookie exists,
   but whether it equals the bearer is unobserved. The response is the documented
   contract.

## Consequences

- Easier:
  - Claude Desktop can recover a session by itself.
  - On the MCP path the password never enters any nemo process.
- Harder / risks:
  - A 5-minute blocking tool call may exceed some MCP clients' timeout; validate
    in Claude Desktop before release.
  - The browser path needs a Chromium download (or Chrome).
  - The headed browser also loads Vector's third-party analytics, as any normal
    visit does.
- Obligation: `server.test.ts` asserts `auth_login` declares no input fields. The
  fake covers success, timeout and contract drift. `docs/vector-contract/auth.md`
  is re-observed if the SPA route or the `SignIn` shape changes.
