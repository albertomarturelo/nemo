#!/usr/bin/env node
// @nemo/mcp entry point. Wires the Node runtime into the server and serves over
// stdio. STDOUT is the JSON-RPC channel — diagnostics go to STDERR only.
import { PlaywrightBrowserLogin, createNodeRuntime } from '@albertomarturelo/nemo-core/node';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { buildServer } from './server.js';

async function main(): Promise<void> {
  // The MCP's only sign-in is the browser (ADR `mcp-browser-login`).
  const server = buildServer(createNodeRuntime({ browser: new PlaywrightBrowserLogin() }));
  await server.connect(new StdioServerTransport());
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
