// The injectable seams (ADR-003). Every external, non-deterministic dependency the
// core touches — the network, the token cache, the wall clock, the audit sink — is
// an interface here with a Node default in `adapters/node` and an in-memory fake in
// `adapters/fake`. Tests inject fakes so they never touch the real Vector portal,
// the real filesystem, or the real clock. A `Runtime` is one bundle of the four.
//
// Vector is a plain JSON REST API with bearer-token auth, so — unlike a browser-
// driven portal — the network seam is a thin HTTP client, not a Playwright driver.

/** A single HTTP exchange. `body`, when present, is sent as a JSON request body. */
export interface HttpRequest {
  method: string;
  url: string;
  headers?: Record<string, string>;
  /** JSON-serializable request body (POST/PUT). Omitted for GET. */
  body?: unknown;
  /** Query string parameters, appended to `url`. Values are stringified. */
  params?: Record<string, string | number | boolean>;
  timeoutMs?: number;
}

/** A minimal, transport-agnostic HTTP response the core parses. */
export interface HttpResponse {
  status: number;
  statusText: string;
  /** Parse the body as JSON (may reject on malformed JSON). */
  json(): Promise<unknown>;
  /** The raw body text (for error surfacing / non-JSON payloads). */
  text(): Promise<string>;
}

/** The network seam. Default: a Node `fetch` adapter. Tests inject a route table. */
export interface HttpClient {
  send(req: HttpRequest): Promise<HttpResponse>;
}

/** Persist the cached bearer token. Default: a JSON file under `~/.nemo/`. The token
 *  is the ONLY thing that ever lands on disk — credentials never do (ADR-006). */
export interface TokenStore {
  get(): Promise<string | null>;
  set(token: string): Promise<void>;
  clear(): Promise<void>;
}

/** Time, behind a seam so JWT-exp math and pacing are testable/resumable. */
export interface Clock {
  /** Epoch milliseconds. */
  now(): number;
}

/** One append-only audit receipt. Keys whose name looks like a secret are dropped
 *  by the sink before the line is written (never a gatekeeper — best effort). */
export interface AuditEntry {
  ts: string;
  action: string;
  result: 'ok' | 'error';
  durationMs?: number;
  [extra: string]: unknown;
}

/** The audit seam. Default: append JSONL to `~/.nemo/audit.log`. */
export interface AuditSink {
  write(entry: AuditEntry): Promise<void>;
}

/** The composed set of seams a task runs against. Surfaces build one (via the
 *  `@albertomarturelo/nemo-core/node` composition root) and pass it into every task. */
export interface Runtime {
  http: HttpClient;
  tokens: TokenStore;
  clock: Clock;
  audit: AuditSink;
}
