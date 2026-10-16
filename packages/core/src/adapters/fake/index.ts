// In-memory fakes for the four seams. Exported from the main barrel as `testing`
// (`import { testing } from '@albertomarturelo/nemo-core'`) so surface + integration tests
// build a Runtime that never touches the network, the filesystem, or the clock.
import { LoginFailedError } from '../../errors/index.js';
import type {
  AuditEntry,
  AuditSink,
  BrowserLogin,
  BrowserSignInOptions,
  Clock,
  HttpClient,
  HttpRequest,
  HttpResponse,
  Runtime,
  TokenStore,
} from '../../seams/index.js';

/** What a fake route returns: a status + either a JSON value or raw text. */
export interface FakeReply {
  status?: number;
  statusText?: string;
  json?: unknown;
  text?: string;
}

/** Build an `HttpResponse` from a declarative `FakeReply`. */
export function reply(r: FakeReply): HttpResponse {
  const status = r.status ?? 200;
  const text = r.text ?? (r.json !== undefined ? JSON.stringify(r.json) : '');
  return {
    status,
    statusText: r.statusText ?? (status < 400 ? 'OK' : 'Error'),
    text: () => Promise.resolve(text),
    json: () =>
      Promise.resolve(r.json !== undefined ? r.json : (JSON.parse(text || 'null') as unknown)),
  };
}

/** A route handler: inspect the request, return a reply (or a promise of one). */
export type FakeHandler = (req: HttpRequest) => FakeReply | Promise<FakeReply>;

/** Fake network seam. Records every request for assertions; delegates the response
 *  to the handler passed in (default: a 200 with an empty body). */
export class FakeHttpClient implements HttpClient {
  readonly calls: HttpRequest[] = [];
  constructor(private readonly handler: FakeHandler = () => ({ status: 200, json: null })) {}

  async send(req: HttpRequest): Promise<HttpResponse> {
    this.calls.push(req);
    return reply(await this.handler(req));
  }
}

/** Fake token store backed by a variable. */
export class MemoryTokenStore implements TokenStore {
  constructor(private token: string | null = null) {}
  get(): Promise<string | null> {
    return Promise.resolve(this.token);
  }
  set(token: string): Promise<void> {
    this.token = token;
    return Promise.resolve();
  }
  clear(): Promise<void> {
    this.token = null;
    return Promise.resolve();
  }
}

/** Fake clock frozen at a fixed epoch-ms; `advance` moves it for expiry tests. */
export class FixedClock implements Clock {
  constructor(private ms = 0) {}
  now(): number {
    return this.ms;
  }
  advance(deltaMs: number): void {
    this.ms += deltaMs;
  }
}

/** Fake audit sink that just collects the receipts. */
export class MemoryAuditSink implements AuditSink {
  readonly entries: AuditEntry[] = [];
  write(entry: AuditEntry): Promise<void> {
    this.entries.push(entry);
    return Promise.resolve();
  }
}

/** Fake browser sign-in: returns a canned token, or rejects with `fail` (a timeout /
 *  closed window by default). Records each call's options for assertions. */
export class FakeBrowserLogin implements BrowserLogin {
  readonly calls: BrowserSignInOptions[] = [];
  constructor(
    private readonly token: string | null,
    private readonly fail: Error = new LoginFailedError('Sign-in not completed (fake).'),
  ) {}
  signIn(options: BrowserSignInOptions): Promise<string> {
    this.calls.push(options);
    return this.token === null ? Promise.reject(this.fail) : Promise.resolve(this.token);
  }
}

/** Assemble a full fake `Runtime`, overriding any seam. The default is a network
 *  that returns empty 200s, no cached token, a frozen clock, and a memory audit. */
export function fakeRuntime(overrides: Partial<Runtime> = {}): Runtime {
  return {
    http: new FakeHttpClient(),
    tokens: new MemoryTokenStore(),
    clock: new FixedClock(),
    audit: new MemoryAuditSink(),
    ...overrides,
  };
}
