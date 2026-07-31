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

## Saldo caja (wired)

The standing cash balance of every caja as of a date, each valued in a chosen
currency. Distinct from Movements: that endpoint reports the *flows* (its per-row
`saldo` is a running balance mid-series), this one reports the *balance*.

Observed on the live portal on **2026-07-31**.

- **Method / path:** `GET /frontoffice/shared/Dashboard/ResumenSaldoCaja`
- **Auth:** `Authorization: Bearer <token>` (via `auth/session.request()`)
- **Query params:**

| Param | Meaning | Example |
| --- | --- | --- |
| `id` | account id; `0` = all accounts | `0` |
| `tipo` | fixed selector | `Cuenta` |
| `codMonedaSld` | valuation currency — drives `montoConvertido` | `CLP` / `USD` |
| `fecha` | balance date `YYYY-MM-DD` | `2026-07-31` |

- **Response (200):** a JSON **array** of cajas, one row each (no nesting —
  unlike Movements, which nests `movimientos` under a bucket). Curated fields
  (missing → empty/zero); all values below are **synthetic** (ADR-012):

```jsonc
[
  {
    "idCajaCuenta": 900001, // bucketId
    "monto": 125000.0, // amount, in this caja's OWN codMoneda
    "numCuenta": "99999999/0", // account
    "codMoneda": "CLP", // the caja's own currency
    "codMercado": "N", // market
    "identificador": "99999999-0", // the portal's key for the caja
    "montoConvertido": 125000.0 // amountConverted — `monto` valued in codMonedaSld
  }
]
```

> **Not observed — do not assume.** The sample above came from a single-caja,
> single-currency response, so three things are still unknown: whether
> `idCajaCuenta` shares an id space with the Movements buckets, what `codMercado`
> values other than `"N"` exist and what they mean, and whether `identificador` is
> always `numCuenta` with the slash swapped for a dash. All three are passed
> through verbatim and nothing in the code depends on them. Re-observe before
> relying on any of them.

> `monto` and `montoConvertido` are equal only when the caja's `codMoneda` already
> matches the requested `codMonedaSld`. A USD caja queried with `codMonedaSld=CLP`
> returns `monto` in USD and `montoConvertido` in CLP — so **only
> `montoConvertido` is summable across cajas**, and it is what `total` adds up.

- **Curated envelope the task returns:**
  `{ currency, fecha, balances: CashBalance[], total }` where `CashBalance` =
  `{ bucketId, account, identifier, currency, market, amount, amountConverted }`
  and `total` = the sum of `amountConverted`, expressed in `currency`.
- **Defaults:** `id = 0` (all accounts), `codMonedaSld = CLP`, `fecha` = today,
  read from the `Clock` seam so it stays testable.
- **Errors:** `>= 400` → `ApiError(status, verbatimBody)`; a non-array body →
  `ContractError` (re-observe).

> **Accepted risk on `total`.** A missing or renamed `montoConvertido` projects to
> `0` (the "missing → empty/zero, never a crash" rule the whole module follows), so
> a field rename would make `total` under-report silently instead of raising. Kept
> deliberately: a per-row `ContractError` would break that rule for every other
> curated field too. If `total` ever looks low, re-observe the field names before
> trusting it.
