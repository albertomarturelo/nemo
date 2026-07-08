# Wire contract — Instruments

Observed from the Python `nemo-cli` (`instruments/*.py`). The **local** surface is
wired; the international + prices surfaces are documented as planned (re-observe on
the live portal before wiring — ROADMAP).

## Local instruments (wired)

- **Method / path:** `GET /shared/Instrumentos/FiltrarInstrumentos`
- **Auth:** `Authorization: Bearer <token>` (via `auth/session.request()`)
- **Query params:**

| Param | Meaning | Example |
| --- | --- | --- |
| `page` | 1-based page number | `1` |
| `limit` | page size | `30` |
| `filterNemotecnico` | free-text filter on the nemotécnico | `BCI` |
| `codSubClaseInstrumentos` | comma-joined sub-classes | `ACC,ACC_INT,CFI,ETF,OPC` |

- **Response (200):** `{ result: [...], total: <int> }`. Each row (curated fields
  the core projects; there are more, alias-tolerant, missing → empty/null):

```jsonc
{
  "result": [
    {
      "idInstrumento": 52185,
      "nemotecnico": "BCI",
      "dscInstrumento": "Banco de Crédito e Inversiones",
      "codSubClaseInstrumento": "ACC",
      "codClaseInstrumento": "RV",
      "codigoFamilia": "…",
      "codMoneda": "CLP",
      "codPais": "CL",
      "isin": "CL0000000001"
    }
  ],
  "total": 1
}
```

- **Curated envelope the task returns:**
  `{ market: "local", page, pageSize, total, items: LocalInstrument[] }`.
- **Errors:** `>= 400` → `ApiError(status, verbatimBody)`; a missing `result`
  array or non-numeric `total` → `ContractError` (re-observe).

## International instruments (planned)

- **Method / path:** `GET /frontoffice/shared/Asset` — re-observe params/shape.

## Local price history (wired)

- **Method / path:** `GET /frontoffice/shared/PublicadorPrecio/GetPreciosInstrumento`
- **Auth:** `Authorization: Bearer <token>` (via `auth/session.request()`)
- **Query params:**

| Param | Meaning | Example |
| --- | --- | --- |
| `idInstrumento` | the local instrument id (from `instruments local`) | `52185` |

- **Response (200):** a **flat JSON array** (NOT wrapped in `{ result }`) of daily
  rows, oldest-last but not guaranteed ordered (the task sorts by `fecha`). ~1 year
  of history; weekends/holidays repeat the prior close. Curated fields (the row
  carries more — mostly `null` — and is alias-tolerant, missing → `""`/`0`):

```jsonc
[
  {
    "idInstrumento": 52185,
    "fecha": "2026-01-01T00:00:00",   // ISO timestamp; kept to the date (YYYY-MM-DD)
    "precio": 19039.844600,           // the daily close (up to 6 decimals)
    "fechaActualizacion": "2026-01-05T12:55:30.81",
    "duracion": null, "tasa": null, "codMoneda": null, "nemotecnico": null,
    "accruedInterest": null           // …and other always-null navigation fields
  }
]
```

> Values above are **synthetic** (ADR-012). Only `fecha` + `precio` are projected.

- **Curated envelope the task returns:**
  `{ market: "local", idInstrumento, points: [{ date, close }], stats: { totalReturn, sigma, min, max } }`.
  `points` is sorted oldest-first; `stats` is pure client-side math (`totalReturn`
  first→last, `sigma` = sample std-dev of daily simple returns, `min`/`max` closes).
- **Local only:** the endpoint does not serve international assets. An unknown or
  non-local id answers `200` + `[]`; the task raises a clear `ApiError` ("No price
  history for instrument …") rather than returning a silent empty envelope.
- **Errors:** `>= 400` → `ApiError(status, verbatimBody)`; a non-array payload →
  `ContractError` (re-observe).
