// Instruments MCP tools. One append-only `registerInstrumentsTools` call from
// server.ts (ADR-007); later reads (international, prices) add sibling tools here.
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  instrumentsLocal,
  instrumentPrices,
  instrumentsInternational,
  type Runtime,
} from '@albertomarturelo/nemo-core';
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

  server.registerTool(
    'instruments_international',
    {
      title: 'List international instruments',
      description:
        'List international (US-listed) instruments from the Vector portal, paged. Filter by ' +
        'symbol/name (search) and/or exchange (e.g. NASDAQ, NYSE). Returns the curated JSON ' +
        'envelope { market, page, pageSize, total, items } — the same shape as instruments_local. ' +
        'Requires a live session (use the CLI `nemo auth login` first — the MCP server cannot ' +
        'sign in).',
      inputSchema: {
        search: z.string().optional(),
        exchange: z.string().optional(),
        page: z.number().int().positive().optional(),
        pageSize: z.number().int().positive().optional(),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    ({ search, exchange, page, pageSize }) =>
      toolJson(() =>
        instrumentsInternational(runtime, {
          ...(search !== undefined ? { search } : {}),
          ...(exchange !== undefined ? { exchange } : {}),
          ...(page !== undefined ? { page } : {}),
          ...(pageSize !== undefined ? { pageSize } : {}),
        }),
      ),
  );

  server.registerTool(
    'instrument_prices',
    {
      title: 'Local instrument price history',
      description:
        'Daily price history (~1 year) for a LOCAL (Chilean) instrument by idInstrumento, with ' +
        'summary stats (total return, σ, min, max). Returns the curated JSON envelope ' +
        '{ market, idInstrumento, points, stats }. Local instruments only (the endpoint does ' +
        'not serve international assets). Requires a live session (use the CLI `nemo auth login` ' +
        'first — the MCP server cannot sign in).',
      inputSchema: {
        id: z.number().int().positive(),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    ({ id }) => toolJson(() => instrumentPrices(runtime, { id })),
  );
}
