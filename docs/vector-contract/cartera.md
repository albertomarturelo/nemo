# Wire contract — Cartera

Observed from the Python `nemo-cli` (`portfolio/movements.py`), which derived it
from the live portal. Re-confirm on the live portal when touching this surface. All
values below are **synthetic** (ADR-012).

## Movements (wired)

Cash movements over a date range, grouped by cash bucket (cuenta caja).

- **Method / path:** `GET /frontoffice/shared/MovimientosCajas/Movimientos`
- **Auth:** `Authorization: Bearer <token>` (via `auth/session.request()`)
- **Timeout:** 180 s — this endpoint can generate a year of activity in one shot
  and is markedly slower than the rest.
- **Query params:**

| Param | Meaning | Example |
| --- | --- | --- |
| `id` | account id; `0` = all accounts | `0` |
| `tipo` | fixed selector | `Cuenta` |
| `desde` | start date `YYYY-MM-DD` | `2025-07-03` |
| `hasta` | end date `YYYY-MM-DD` | `2026-07-03` |

- **Response (200):** a JSON **array** of cash buckets. Each bucket:
  `{ idCajaCuenta, dscCajaCuenta, movimientos: [...] }`. Each movement (curated
  fields; missing → empty/zero):

```jsonc
[
  {
    "idCajaCuenta": 7,
    "dscCajaCuenta": "Caja CLP",
    "movimientos": [
      {
        "movimiento": "DIV;10-4-2026;BCI;3,5",   // description — the classification key
        "abono": 3500,                             // credit
        "cargo": 0,                                // debit
        "saldo": 3500,                             // balance
        "codMoneda": "CLP",
        "fechaMovimiento": "2026-04-10T00:00:00",
        "fechaLiquidacion": "2026-04-12T00:00:00",
        "orden": 1,
        "numCuenta": "999"
      }
    ]
  }
]
```

- **Curated envelope the task returns:**
  `{ from, to, summary, buckets: [{ bucketId, name, summary, movements: Movement[] }] }`
  where `summary` = `{ totalCashIn, totalCashOut, totalDividends, totalCommissions,
  totalBuys, totalSells, byDividend[], byTrade[] }`.
- **Errors:** `>= 400` → `ApiError(status, verbatimBody)`; a non-array body →
  `ContractError` (re-observe).

### Classification rules (from the `movimiento` description)

Each row's `kind` is derived from its description, observed on the live portal:

| Rule (on the trimmed description) | `kind` | Parsed |
| --- | --- | --- |
| `DIV;<d-m-yyyy>;<nemo>;<amount>` | `dividend` | `{ exDate, nemotecnico, perUnitAmount }` |

> `amount` uses Chilean number formatting — `.` groups thousands and `,` is the
> decimal separator (e.g. `1.234,56` → `1234.56`), normalised by the parser.

| `COMPRA FONDOS CB - <nemo>` | `buy` | `{ nemotecnico, side: buy }` |
| `VENTA FONDOS CB - <nemo>` | `sell` | `{ nemotecnico, side: sell }` |
| exactly `COMISION TRANSACCIÓN BOLSA` | `commission` | — |
| a RUT (`NN.NNN.NNN-D`) + `abono > 0` | `cash_in` | — |
| a RUT + `cargo > 0` | `cash_out` | — |
| anything else | `other` | — (excluded from every total) |

## Summary (wired)

Current holdings valued in a chosen currency, with a client-computed P&L and
totals grouped by classification.

- **Method / path:** `GET /frontoffice/shared/cartera/CierreCarteraResumidaOnline`
- **Auth:** `Authorization: Bearer <token>` (via `auth/session.request()`)
- **Query params:**

| Param | Meaning | Example |
| --- | --- | --- |
| `id` | account id; `0` = all accounts | `0` |
| `tipo` | fixed selector | `Cuenta` |
| `codMonedaSld` | valuation currency (drives `codMonedaDflt` + the present-value fields) | `CLP` / `USD` |
| `conDividendos` | fold accrued dividends into the valuation — string `"true"` / `"false"` | `"true"` |

- **Response (200):** a JSON **array** of holdings. Curated fields (missing →
  empty/zero/null); all values below are **synthetic** (ADR-012):

```jsonc
[
  {
    "cuenta": "99999999/0",              // account (also in numCuenta)
    "numCuenta": "99999999/0",
    "dscCuenta": "SYNTHETIC ACCOUNT",     // accountName
    "clasificacion": "RENTA FIJA",        // grouping key for the totals
    "subClasificacion": "Inversiones Alternativas",
    "idInstrumento": 1000,
    "nemotecnico": "CFISYNTHRF",
    "dscInstrumento": "SYNTHETIC FIXED INCOME FUND",
    "codSubClaseInstrumento": "CFI",      // instrumentSubclass
    "serie": null,                        // space-padded on the wire → trimmed; null if blank
    "codMonedaDflt": "CLP",               // reflects codMonedaSld
    "cantidad": 10.0,                     // quantity
    "tasaPrecioCompra": 100.0,            // avgBuyPrice
    "tasaPrecio": 120.0,                  // marketPrice
    "valorPresenteCompraMonDflt": 1000.0, // costBasis
    "valorPresenteMercadoMonDflt": 1200.0,// marketValue
    "fechaConsulta": "2026-07-07T00:00:00"// queryDate (date part only)
  }
]
```

> In a `codMonedaSld=USD` response the two `valorPresente…MonDflt` fields (and
> `codMonedaDflt`) are the USD valuation; the `valorMercadoMoneda*` fields stay in
> the account currency and are **not** part of the curated shape.

- **P&L (pure, client-side):** per holding `pnl = marketValue − costBasis`,
  `pnlPct = pnl / costBasis` (a fraction; `0` when `costBasis <= 0`, so a
  fully-divested row never divides by zero). Totals group by `clasificacion`
  (sorted), plus a grand total over all holdings. `queryDate` = the latest
  `fechaConsulta` across the holdings.
- **Curated envelope the task returns:**
  `{ currency, queryDate, holdings: Holding[], totalsByClassification:
  ClassificationTotal[], totals }` where `totals` = `{ costBasis, marketValue,
  pnl, pnlPct }`.
- **Errors:** `>= 400` → `ApiError(status, verbatimBody)`; a non-array body →
  `ContractError` (re-observe).
