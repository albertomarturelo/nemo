// The Node DEFAULT implementations of the four seams (ADR-003). Kept OFF the main
// barrel (reachable only via `@albertomarturelo/nemo-core/node`, ADR-008) so importing the
// library's tasks never pulls in `node:*`. Vector is a plain JSON REST API, so the
// network default is a `fetch` client — no browser, no Playwright.
import { appendFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
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

/** Default token store: a JSON file `{ "token": "..." }` in the state directory. */
export class FileTokenStore implements TokenStore {
  private readonly file: string;

  constructor(dir: string = resolveNemoDir()) {
    this.file = join(dir, 'token.json');
  }

  async get(): Promise<string | null> {
    try {
      const raw: unknown = JSON.parse(await readFile(this.file, 'utf8'));
      if (typeof raw !== 'object' || raw === null) return null;
      const token = (raw as Record<string, unknown>).token;
      return typeof token === 'string' && token ? token : null;
    } catch {
      return null;
    }
  }

  async set(token: string): Promise<void> {
    await mkdir(dirname(this.file), { recursive: true });
    await writeFile(this.file, JSON.stringify({ token }), 'utf8');
  }

  async clear(): Promise<void> {
    await rm(this.file, { force: true });
  }
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
