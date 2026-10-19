// Composition subpath `@albertomarturelo/nemo-core/node` (ADR-008): the Node default
// adapters plus the composition root. Kept OFF the main barrel so importing the
// library's tasks never evaluates `node:*` — a consumer that injects its own seams
// (ADR-003) stays free of them entirely.
import {
  FetchHttpClient,
  FileAuditSink,
  FileTokenStore,
  resolveNemoDir,
  SystemClock,
} from './adapters/node/index.js';
import type { Runtime } from './seams/index.js';

// Browser sign-in default (lazy `playwright`). `createNodeRuntime` leaves `browser`
// unset; each surface's composition root wires it explicitly (MCP `auth_login`,
// CLI `auth login --browser`), so an embedder never gets a browser by accident.
export { PlaywrightBrowserLogin } from './adapters/node/browser-login.js';

export {
  FetchHttpClient,
  FileAuditSink,
  FileTokenStore,
  NEMO_DIR,
  resolveNemoDir,
  SystemClock,
} from './adapters/node/index.js';

/** Composition root: the Node default adapters, any seam replaceable (ADR-003).
 *  e.g. `createNodeRuntime({ http: myClient })` keeps the other three defaults.
 *  The state directory is resolved here, once, so a bad `NEMO_HOME` fails as a
 *  `ValidationError` before any file is touched. */
export function createNodeRuntime(overrides: Partial<Runtime> = {}): Runtime {
  const dir = resolveNemoDir();
  return {
    http: new FetchHttpClient(),
    tokens: new FileTokenStore(dir),
    clock: new SystemClock(),
    audit: new FileAuditSink(dir),
    ...overrides,
  };
}
