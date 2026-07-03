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
