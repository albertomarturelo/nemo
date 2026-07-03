// The Node DEFAULT implementations of the four seams (ADR-003). Kept OFF the main
// barrel (reachable only via `@albertomarturelo/nemo-core/node`, ADR-008) so importing the
// library's tasks never pulls in `node:*`. Vector is a plain JSON REST API, so the
// network default is a `fetch` client — no browser, no Playwright.
import { appendFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import type {
  AuditEntry,
  AuditSink,
  Clock,
  HttpClient,
  HttpRequest,
  HttpResponse,
  TokenStore,
} from '../../seams/index.js';

/** All local state lives here — the cached token and the audit log. Gitignored;
 *  never commit it (mirrors nemo-cli's per-user config dir). */
export const NEMO_DIR = join(homedir(), '.nemo');
const TOKEN_FILE = join(NEMO_DIR, 'token.json');
const AUDIT_FILE = join(NEMO_DIR, 'audit.log');

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

/** Default token store: a JSON file `{ "token": "..." }` under `~/.nemo/`. */
export class FileTokenStore implements TokenStore {
  async get(): Promise<string | null> {
    try {
      const raw: unknown = JSON.parse(await readFile(TOKEN_FILE, 'utf8'));
      if (typeof raw !== 'object' || raw === null) return null;
      const token = (raw as Record<string, unknown>).token;
      return typeof token === 'string' && token ? token : null;
    } catch {
      return null;
    }
  }

  async set(token: string): Promise<void> {
    await mkdir(dirname(TOKEN_FILE), { recursive: true });
    await writeFile(TOKEN_FILE, JSON.stringify({ token }), 'utf8');
  }

  async clear(): Promise<void> {
    await rm(TOKEN_FILE, { force: true });
  }
}

/** Default clock: the wall clock. */
export class SystemClock implements Clock {
  now(): number {
    return Date.now();
  }
}

/** Default audit sink: append one JSON line per receipt to `~/.nemo/audit.log`.
 *  Secret-looking keys are dropped before writing (never a plaintext secret). */
export class FileAuditSink implements AuditSink {
  async write(entry: AuditEntry): Promise<void> {
    await mkdir(dirname(AUDIT_FILE), { recursive: true });
    await appendFile(AUDIT_FILE, `${JSON.stringify(redact(entry))}\n`, 'utf8');
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
