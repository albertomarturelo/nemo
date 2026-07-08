// Public API of @albertomarturelo/nemo-core. Surfaces (CLI, MCP) import ONLY from here — the
// task layer plus the seam interfaces (ADR-003). Reaching into a sub-module
// (auth/session internals, adapters) from a surface is forbidden and CI-guarded.
//
// NOTE: `login` (takes a password) is intentionally NOT here — it lives in the
// CLI-only subpath `@albertomarturelo/nemo-core/cli`, so the MCP server (which imports this
// barrel) cannot wire a credential-taking task (ADR-006).

// --- tasks: the public operations ---
export { authStatus, logout } from './tasks/auth.js';
export type { AuthState, AuthStatusResult, LogoutResult, LoginResult } from './tasks/auth.js';
export { instrumentsLocal } from './tasks/instruments.js';
export type {
  LocalInstrument,
  LocalInstrumentsPage,
  LocalInstrumentsQuery,
} from './tasks/instruments.js';
export { carteraMovements, carteraSummary } from './tasks/cartera.js';
export type {
  MovementKind,
  Movement,
  DividendInfo,
  TradeInfo,
  DividendSummaryItem,
  TradeSummaryItem,
  MovementsSummary,
  CashBucket,
  MovementsResult,
  MovementsQuery,
  Holding,
  ClassificationTotal,
  SummaryTotals,
  SummaryResult,
  SummaryQuery,
} from './tasks/cartera.js';

// --- seams: the injectable contract a consumer composes a Runtime from ---
// The Node default adapters + `createNodeRuntime` live in the `./node` subpath
// (ADR-008), so this barrel's static graph stays free of `node:*`.
export type {
  AuditEntry,
  AuditSink,
  Clock,
  HttpClient,
  HttpRequest,
  HttpResponse,
  Runtime,
  TokenStore,
} from './seams/index.js';

// --- shared primitives + config ---
export { API_BASE_URL, ENDPOINTS, DEFAULT_LOCAL_SUBCLASSES } from './config/index.js';
export * from './errors/index.js';

// --- testing helpers: in-memory fakes for surface / integration tests ---
export * as testing from './adapters/fake/index.js';
