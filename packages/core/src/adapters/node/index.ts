// The Node DEFAULT implementations of the four seams (ADR-003). Kept OFF the main
// barrel (reachable only via `@albertomarturelo/nemo-core/node`, ADR-008) so importing the
// library's tasks never pulls in `node:*`. Vector is a plain JSON REST API, so the
// network default is a `fetch` client — no browser, no Playwright.
import { appendFile, chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join } from 'node:path';
import { ValidationError } from '../../errors/index.js';
import type {
  AuditEntry,
  AuditSink,
  Clock,
  HttpClient,
  HttpRequest,
  HttpResponse,
  LatchEntry,
  LoginLatch,
  TokenStore,
} from '../../seams/index.js';

/** The DEFAULT home of all local state — the cached token and the audit log — used
 *  when `NEMO_HOME` is unset. Never commit it (mirrors nemo-cli's per-user config
 *  dir). The effective directory is `resolveNemoDir()`. */
export const NEMO_DIR = join(homedir(), '.nemo');

/** The state directory: `NEMO_HOME` when set, else `~/.nemo`. An agent platform may
 *  persist a single path (Grok Bot keeps only `/workspace`), so the state must be
 *  movable there (ADR `non-interactive-login`). A relative path is refused rather
 *  than resolved: a cron changes its working directory, and a quoted `~` is never
 *  expanded by the shell, so either would silently split the state in two. */
export function resolveNemoDir(
  env: Readonly<Record<string, string | undefined>> = process.env,
): string {
  const dir = env.NEMO_HOME;
  if (dir === undefined || dir === '') return NEMO_DIR;
  if (!isAbsolute(dir)) {
    throw new ValidationError(`NEMO_HOME must be an absolute path, got "${dir}".`);
  }
  return dir;
}

/** Default network seam: Node global `fetch`, with a per-request timeout and JSON
 *  body encoding. The body is read once and cached so both `json()` and `text()`
 *  are safe to call (the core calls exactly one, but this keeps the seam robust). */
export class FetchHttpClient implements HttpClient {
  async send(req: HttpRequest): Promise<HttpResponse> {
    const url = new URL(req.url);
    if (req.params) {
      for (const [key, value] of Object.entries(req.params)) {
        url.searchParams.set(key, String(value));
      }
    }
    const headers: Record<string, string> = { ...req.headers };
    let body: string | undefined;
    if (req.body !== undefined) {
      body = JSON.stringify(req.body);
      headers['Content-Type'] ??= 'application/json';
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), req.timeoutMs ?? 15_000);
    try {
      const res = await fetch(url, {
        method: req.method,
        headers,
        ...(body !== undefined ? { body } : {}),
        signal: controller.signal,
      });
      const text = await res.text();
      return bufferedResponse(res.status, res.statusText, text);
    } finally {
      clearTimeout(timer);
    }
  }
}

/** Default token store: a JSON file `{ "token": "...", "username"?: "..." }` in the
 *  state directory, owner-only (`0600`): the bearer is a secret. */
export class FileTokenStore implements TokenStore {
  private readonly file: string;

  constructor(dir: string = resolveNemoDir()) {
    this.file = join(dir, 'token.json');
  }

  async get(): Promise<string | null> {
    return this.field('token');
  }

  async username(): Promise<string | null> {
    return this.field('username');
  }

  async set(token: string, username: string | null): Promise<void> {
    await mkdir(dirname(this.file), { recursive: true });
    const body = username === null ? { token } : { token, username };
    await writeFile(this.file, JSON.stringify(body), { encoding: 'utf8', mode: 0o600 });
    // `mode` applies only when the file is created; tighten one an older version
    // wrote with the default umask.
    await chmod(this.file, 0o600);
  }

  /** A non-empty string field of the file, or null (missing / unreadable file). */
  private async field(name: 'token' | 'username'): Promise<string | null> {
    try {
      const raw: unknown = JSON.parse(await readFile(this.file, 'utf8'));
      if (typeof raw !== 'object' || raw === null) return null;
      const value = (raw as Record<string, unknown>)[name];
      return typeof value === 'string' && value ? value : null;
    } catch {
      return null;
    }
  }

  async clear(): Promise<void> {
    await rm(this.file, { force: true });
  }
}

/** Default rejection latch: `login-blocked.json` in the state directory, a JSON array
 *  of `{ user, at, status }`, owner-only (`0600`). The file is removed once empty,
 *  so its absence means "nothing is blocked". An unreadable file reads as empty: the
 *  latch is a guard on top of Vector's own lockout, and a corrupt file must not
 *  wedge every sign-in. */
export class FileLoginLatch implements LoginLatch {
  private readonly file: string;

  constructor(dir: string = resolveNemoDir()) {
    this.file = join(dir, 'login-blocked.json');
  }

  async list(): Promise<LatchEntry[]> {
    try {
      const raw: unknown = JSON.parse(await readFile(this.file, 'utf8'));
      return Array.isArray(raw) ? raw.filter(isLatchEntry) : [];
    } catch {
      return [];
    }
  }

  async trip(entry: LatchEntry): Promise<void> {
    const others = (await this.list()).filter((e) => e.user !== entry.user);
    await this.write([...others, entry]);
  }

  async clear(user?: string): Promise<string[]> {
    const entries = await this.list();
    const removed = entries.filter((e) => user === undefined || e.user === user);
    if (removed.length > 0) await this.write(entries.filter((e) => !removed.includes(e)));
    return removed.map((e) => e.user);
  }

  private async write(entries: LatchEntry[]): Promise<void> {
    if (entries.length === 0) {
      await rm(this.file, { force: true });
      return;
    }
    await mkdir(dirname(this.file), { recursive: true });
    await writeFile(this.file, JSON.stringify(entries), { encoding: 'utf8', mode: 0o600 });
    await chmod(this.file, 0o600);
  }
}

function isLatchEntry(value: unknown): value is LatchEntry {
  if (typeof value !== 'object' || value === null) return false;
  const e = value as Record<string, unknown>;
  return typeof e.user === 'string' && typeof e.at === 'string' && typeof e.status === 'number';
}

/** Default clock: the wall clock. */
export class SystemClock implements Clock {
  now(): number {
    return Date.now();
  }
}

/** Default audit sink: append one JSON line per receipt to `audit.log` in the state
 *  directory. Secret-looking keys are dropped before writing (never a plaintext
 *  secret). */
export class FileAuditSink implements AuditSink {
  private readonly file: string;

  constructor(dir: string = resolveNemoDir()) {
    this.file = join(dir, 'audit.log');
  }

  async write(entry: AuditEntry): Promise<void> {
    await mkdir(dirname(this.file), { recursive: true });
    await appendFile(this.file, `${JSON.stringify(redact(entry))}\n`, 'utf8');
  }
}

const SECRET_KEY = /password|clave|token|secret|cookie|authorization/i;
function redact(entry: AuditEntry): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(entry)) {
    if (!SECRET_KEY.test(key)) out[key] = value;
  }
  return out;
}

function bufferedResponse(status: number, statusText: string, text: string): HttpResponse {
  return {
    status,
    statusText,
    text: () => Promise.resolve(text),
    json: () => Promise.resolve(JSON.parse(text) as unknown),
  };
}
