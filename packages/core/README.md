# @albertomarturelo/nemo-core

The shared domain nucleus for **nemo** — a TypeScript library that models the
Vector Capital broker portal (auth/session, instruments, cartera) behind a
small set of injectable seams. Two thin surfaces consume it: the [`nemo`
CLI](../cli) and the [`nemo-mcp` server](../mcp).

> ⚠️ Unofficial. Not affiliated with, endorsed, or sponsored by Vector Capital
> S.A. Corredores de Bolsa. Provided "as is" (MIT). See the repo root README.

## Design

- **Tasks are the public API.** Import only from the barrel (`@albertomarturelo/nemo-core`).
  A surface never reaches past the task layer into the session/HTTP internals —
  that is where the auth-renewal and audit rails live (ADR-003).
- **External side-effects are seams.** `HttpClient`, `TokenStore`, `Clock`, and
  `AuditSink` are interfaces with Node defaults (`@albertomarturelo/nemo-core/node`) and
  in-memory fakes (`import { testing } from '@albertomarturelo/nemo-core'`). Tests inject
  fakes and never touch the network, disk, or clock.
- **The password never enters the main barrel.** `login` (credential-taking) is
  exported only from `@albertomarturelo/nemo-core/cli`, so the MCP server cannot wire it
  (ADR-006).

## Usage

```ts
import { instrumentsLocal, authStatus } from '@albertomarturelo/nemo-core';
import { createNodeRuntime } from '@albertomarturelo/nemo-core/node';

const rt = createNodeRuntime();
console.log(await authStatus(rt));
console.log(await instrumentsLocal(rt, { search: 'BCI' }));
```

## Tasks

Each task takes the `Runtime` as its first argument (the one pure helper,
`sparkline`, does not) and returns a plain, JSON-serializable object — no `Date`
/ `Map` / `Set` and no human formatting. That shape is the integration contract
(ADR-010).

| Task | Returns |
| --- | --- |
| `authStatus` | Local session state (`active` / `expiring` / `expired` / `logged_out`) — never touches the network |
| `logout` | Drops the cached bearer token |
| `instrumentsLocal` | Chilean instruments, paged: `{ market, page, pageSize, total, items }` |
| `instrumentsInternational` | US-listed instruments, same paged shape |
| `instrumentPrices` | ~1y daily price history with pure client-side stats: `{ points, stats }` |
| `sparkline` | Pure helper — renders a price series as a unicode sparkline |
| `carteraSummary` | Holdings valued in one currency with computed P&L, plus totals by classification |
| `carteraMovements` | Cash movements over a date range, classified per kind, with per-nemotécnico aggregates |
| `carteraSaldo` | Standing cash balance per caja at a date, valued in one currency, plus a grand total (since 0.2.0) |

`login` is deliberately absent from this barrel: it takes a password, so it is
exported only from `@albertomarturelo/nemo-core/cli` (ADR-006).

See [`docs/ARCHITECTURE.md`](../../docs/ARCHITECTURE.md) and the wire contracts
under [`docs/vector-contract/`](../../docs/vector-contract/).
