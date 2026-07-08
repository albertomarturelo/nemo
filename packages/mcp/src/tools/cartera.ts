// Cartera (portfolio) MCP tools. One append-only `registerCarteraTools` call from
// server.ts (ADR-007); later reads (summary) add sibling tools here.
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { carteraMovements, carteraSummary, type Runtime } from '@albertomarturelo/nemo-core';
import { toolJson } from '../tool-helpers.js';

export function registerCarteraTools(server: McpServer, runtime: Runtime): void {
  server.registerTool(
    'cartera_movements',
    {
      title: 'List cash movements',
      description:
        'List cash movements over a date range (default: last 365 days), each classified as ' +
        'dividend / buy / sell / commission / cash_in / cash_out / other, with per-nemotécnico ' +
        'aggregates. Returns the JSON envelope { from, to, summary, buckets }. Requires a live ' +
        'session (sign in with the CLI `nemo auth login` first — the MCP server cannot sign in).',
      inputSchema: {
        desde: z.string().optional(),
        hasta: z.string().optional(),
        accountId: z.number().int().nonnegative().optional(),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    ({ desde, hasta, accountId }) =>
      toolJson(() =>
        carteraMovements(runtime, {
          ...(desde !== undefined ? { desde } : {}),
          ...(hasta !== undefined ? { hasta } : {}),
          ...(accountId !== undefined ? { accountId } : {}),
        }),
      ),
  );

  server.registerTool(
    'cartera_summary',
    {
      title: 'Cartera holdings summary (P&L)',
      description:
        'List current holdings, each valued in the requested currency with a computed profit/loss, ' +
        'plus totals grouped by classification and a grand total. Returns the JSON envelope ' +
        '{ currency, queryDate, holdings, totalsByClassification, totals }. Requires a live session ' +
        '(sign in with the CLI `nemo auth login` first — the MCP server cannot sign in).',
      inputSchema: {
        accountId: z.number().int().nonnegative().optional(),
        currency: z.string().optional(),
        withDividends: z.boolean().optional(),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    ({ accountId, currency, withDividends }) =>
      toolJson(() =>
        carteraSummary(runtime, {
          ...(accountId !== undefined ? { accountId } : {}),
          ...(currency !== undefined ? { currency } : {}),
          ...(withDividends !== undefined ? { withDividends } : {}),
        }),
      ),
  );
}
