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

## Local price history (planned)

- **Method / path:** `GET /frontoffice/shared/PublicadorPrecio/GetPreciosInstrumento`
  — `--id <idInstrumento>`; ~1 year of daily prices. Local instruments only.
