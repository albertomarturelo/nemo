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

See [`docs/ARCHITECTURE.md`](../../docs/ARCHITECTURE.md) and the wire contracts
under [`docs/vector-contract/`](../../docs/vector-contract/).
