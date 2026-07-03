// Portfolio MCP tools. One append-only `registerPortfolioTools` call from server.ts
// (ADR-007); later reads (summary) add sibling tools here.
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { portfolioMovements, type Runtime } from '@albertomarturelo/nemo-core';
import { toolJson } from '../tool-helpers.js';

export function registerPortfolioTools(server: McpServer, runtime: Runtime): void {
  server.registerTool(
    'portfolio_movements',
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
        portfolioMovements(runtime, {
          ...(desde !== undefined ? { desde } : {}),
          ...(hasta !== undefined ? { hasta } : {}),
          ...(accountId !== undefined ? { accountId } : {}),
        }),
      ),
  );
}
