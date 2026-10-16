// Composition subpath `@albertomarturelo/nemo-core/node` (ADR-008): the Node default
// adapters plus the composition root. Kept OFF the main barrel so importing the
// library's tasks never evaluates `node:*` — a consumer that injects its own seams
// (ADR-003) stays free of them entirely.
import {
  FetchHttpClient,
  FileAuditSink,
  FileTokenStore,
  SystemClock,
} from './adapters/node/index.js';
import type { Runtime } from './seams/index.js';

// Browser sign-in default (lazy `playwright`), wired explicitly by the MCP server
// only — `createNodeRuntime` leaves `browser` unset, so the CLI never gets one.
export { PlaywrightBrowserLogin } from './adapters/node/browser-login.js';

export {
  FetchHttpClient,
  FileAuditSink,
  FileTokenStore,
  NEMO_DIR,
  SystemClock,
} from './adapters/node/index.js';

/** Composition root: the Node default adapters, any seam replaceable (ADR-003).
 *  e.g. `createNodeRuntime({ http: myClient })` keeps the other three defaults. */
export function createNodeRuntime(overrides: Partial<Runtime> = {}): Runtime {
  return {
    http: new FetchHttpClient(),
    tokens: new FileTokenStore(),
    clock: new SystemClock(),
    audit: new FileAuditSink(),
    ...overrides,
  };
}
