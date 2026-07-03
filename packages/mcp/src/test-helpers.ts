// Shared fixture for the MCP suite: an in-memory MCP client wired to buildServer,
// a fake runtime builder, and result-narrowing helpers. Fakes only — no network.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { testing, type Runtime } from '@albertomarturelo/nemo-core';
import { buildServer } from './server.js';

/** A token that never expires (year 2100), so reads don't trigger a refresh. */
export const FRESH_TOKEN = (() => {
  const b64 = (s: string): string => Buffer.from(s, 'utf8').toString('base64url');
  return `${b64('{"alg":"none"}')}.${b64(JSON.stringify({ exp: 4_102_444_800 }))}.sig`;
})();

export function makeRuntime(overrides: Partial<Runtime> = {}): Runtime {
  return testing.fakeRuntime(overrides);
}

/** Wire a real MCP Client to the server over a linked in-memory transport. */
export async function connect(runtime: Runtime): Promise<Client> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await buildServer(runtime).connect(serverTransport);
  const client = new Client({ name: 'test', version: '0' });
  await client.connect(clientTransport);
  return client;
}

// The SDK result `content`/`contents` items are typed unions; narrow to the text.
export const toolText = (res: unknown): string =>
  (res as { content?: { text?: string }[] }).content?.[0]?.text ?? '';

export const resourceText = (res: unknown): string =>
  (res as { contents?: { text?: string }[] }).contents?.[0]?.text ?? '';

export const isError = (res: unknown): boolean => (res as { isError?: boolean }).isError === true;

export const propKeys = (schema: unknown): string[] =>
  Object.keys((schema as { properties?: Record<string, unknown> } | undefined)?.properties ?? {});
