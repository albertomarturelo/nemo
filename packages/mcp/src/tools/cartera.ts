// Cartera (portfolio) MCP tools: movements, summary, saldo. One append-only
// `registerCarteraTools` call from server.ts (ADR-007); a later read adds a
// sibling tool here.
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  carteraMovements,
  carteraSaldo,
  carteraSummary,
  type Runtime,
} from '@albertomarturelo/nemo-core';
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
        'session (call auth_login first when signed out).',
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
        '(call auth_login first when signed out).',
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

  server.registerTool(
    'cartera_saldo',
    {
      title: 'Cartera cash balance (saldo caja)',
      description:
        'Show the cash balance of every caja as of a date (default: today), each valued in the ' +
        'requested currency, plus a grand total. This is the standing cash balance, not the ' +
        'flows `cartera_movements` reports. Returns the JSON envelope ' +
        '{ currency, fecha, balances, total }. Requires a live session (call auth_login first when signed out).',
      inputSchema: {
        accountId: z.number().int().nonnegative().optional(),
        currency: z.string().optional(),
        fecha: z.string().optional(),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    ({ accountId, currency, fecha }) =>
      toolJson(() =>
        carteraSaldo(runtime, {
          ...(accountId !== undefined ? { accountId } : {}),
          ...(currency !== undefined ? { currency } : {}),
          ...(fecha !== undefined ? { fecha } : {}),
        }),
      ),
  );
}
