// Instruments MCP tools. One append-only `registerInstrumentsTools` call from
// server.ts (ADR-007); later reads (international, prices) add sibling tools here.
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { instrumentsLocal, type Runtime } from '@albertomarturelo/nemo-core';
import { toolJson } from '../tool-helpers.js';

export function registerInstrumentsTools(server: McpServer, runtime: Runtime): void {
  server.registerTool(
    'instruments_local',
    {
      title: 'List Chilean instruments',
      description:
        'List local (Chilean) instruments from the Vector portal, paged. Returns the ' +
        'curated JSON envelope { market, page, pageSize, total, items }. Requires a live ' +
        'session (use the CLI `nemo auth login` first — the MCP server cannot sign in).',
      inputSchema: {
        search: z.string().optional(),
        page: z.number().int().positive().optional(),
        limit: z.number().int().positive().optional(),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    ({ search, page, limit }) =>
      toolJson(() =>
        instrumentsLocal(runtime, {
          ...(search !== undefined ? { search } : {}),
          ...(page !== undefined ? { page } : {}),
          ...(limit !== undefined ? { limit } : {}),
        }),
      ),
  );
}
