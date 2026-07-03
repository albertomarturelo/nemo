# Vector Capital wire contracts

One file per portal surface, documenting the request shape, a **redacted**
response, and the observation date. This is the source of truth for every
endpoint the core calls — derived from first-hand observation of the live portal,
never from external docs (ADR-004). Capture a contract here BEFORE integrating a
new endpoint.

> ⚠️ Never paste a real, unredacted response (it carries account PII: email,
> holdings, amounts). Replace identifying values with synthetic ones.

Base URL and sub-prefixes are the single source of truth in
`packages/core/src/config/index.ts`:

- `/publicapi` — auth (`SignIn`, `RefreshToken`)
- `/shared` — local Chilean instruments
- `/frontoffice` — international assets, portfolio, prices, movements

| Surface | File | Status |
| --- | --- | --- |
| Auth (SignIn / RefreshToken) | [auth.md](auth.md) | Wired |
| Instruments — local | [instruments.md](instruments.md) | Wired (local) |
| Instruments — international / prices | [instruments.md](instruments.md) | Planned |
| Portfolio — summary / movements | — | Planned |
