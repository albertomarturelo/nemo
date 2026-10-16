# Wire contract — Auth

Observed from the Python `nemo-cli` (`auth/service.py`), which derived it from the
live portal. Re-confirm on the live portal when touching this surface.

## SignIn

Mint a bearer token from credentials. This is the ONLY call that takes a password,
and it is reachable only from the CLI-only `login` task (ADR-006).

- **Method / path:** `POST /publicapi/shared/auth/SignIn`
- **Body:** `{ "userName": "<email>", "password": "<secret>" }`
- **Auth:** none (this is the bootstrap)
- **Response (200):** a JSON object with a top-level `token` string:

```jsonc
{ "token": "eyJhbGciOi…" }   // the bearer JWT
```

- **Errors:** any `>= 400` → `LoginFailedError` with the status + verbatim body.

## Web login (browser) — observed 2026-10-15

Headed observation of the portal's own SPA (one human sign-in; request bodies never
read; every value below is a type, not data). Backs ADR `mcp-browser-login`.

1. `GET /` → `200 text/html`, the SPA routes to **`/sign-in`** and fetches
   `GET /runtime-config` (JSON, unauthenticated).
2. The user types the credentials into Vector's form. The SPA makes the SAME call
   as the CLI: `POST /api/publicapi/shared/auth/SignIn` → `200 application/json`.
   No second factor, no captcha observed.
3. The response carries more than `token` (the CLI only reads `token`):

   ```jsonc
   {
     "token": "<jwt>",            // claims: sub, given_name, emailConfirmed, usuarioExt,
                                   //         jti, role, nbf, exp, iat, iss, aud
     "user": { /* PII: nombre, userName, appEmail, userId, … — never read/persisted */ },
     "systemConfig": { "cierreSistema": "<string>", "sistemaBloqueado": false, … }
   }
   ```

4. The SPA then navigates to **`/frontOffice/dashboard-home`** and every data call
   sends `Authorization: Bearer <token>`.
5. **The token is NOT in web storage.** `localStorage` holds `system-config` +
   analytics ids, and `sessionStorage` an analytics key. There is an httpOnly,
   secure `access_token` cookie on `portalclientes.vectorcapital.cl`. Whether it
   equals the bearer is unobserved, so we don't rely on it.
6. Third-party analytics load on the page (Segment, Microsoft Clarity, Bing). That
   is incidental and not part of the contract.

Success signal for an automated headed browser: the 2xx response to `SignIn`. Take
`token` from it and nothing else.

## RefreshToken

Trade a still-valid token for a fresh one (ADR-005). No credentials involved.

- **Method / path:** `GET /publicapi/shared/auth/RefreshToken`
- **Headers:** `Authorization: Bearer <current-token>`
- **Response (200):** a **JSON-encoded string** (not an object) — the new JWT:

```jsonc
"eyJhbGciOi…"
```

- **Errors:** any `>= 400`, or a non-string / empty body → `SessionExpiredError`
  (the caller clears the token and tells the user to `nemo auth login`).

## Notes

- The token's `exp` claim is read (signature-unverified) to drive proactive
  renewal within `PROACTIVE_REFRESH_SECONDS` (`config`). The server remains the
  authority; the reactive `401` path is the real gate.
- Only the token is ever persisted (`~/.nemo/token.json`); the password is held in
  memory for one `SignIn`, then discarded (ADR-006).
