# Wire contract — Portfolio

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

## Summary (planned)

- **Method / path:** `GET /frontoffice/shared/cartera/CierreCarteraResumidaOnline`
  — holdings + P&L + totals by classification. See issue #3.
