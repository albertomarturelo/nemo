// `nemo instruments …` — market data reads. The first ported read surface; later
// ones (international, prices) add a sibling subcommand here. Append-only: one
// `registerInstruments` call from program.ts (ADR-007).
import type { Command } from 'commander';
import {
  instrumentsLocal,
  instrumentPrices,
  instrumentsInternational,
  sparkline,
  type Runtime,
} from '@albertomarturelo/nemo-core';
import { emit, out } from '../io.js';

export function registerInstruments(program: Command, runtime: Runtime): void {
  const instruments = program.command('instruments').description('Browse market instruments.');

  instruments
    .command('local')
    .description('List Chilean instruments (paged).')
    .option('--search <text>', 'Filter by nemotécnico.', '')
    .option('--page <n>', 'Page number (1-based).', '1')
    .option('--limit <n>', 'Page size.', '30')
    .action(async (opts: { search: string; page: string; limit: string }) => {
      const page = await instrumentsLocal(runtime, {
        search: opts.search,
        page: Number(opts.page),
        limit: Number(opts.limit),
      });
      emit(page, () => {
        for (const item of page.items) out(`${item.nemotecnico}\t${item.descripcion}`);
        out(`— ${page.items.length} shown of ${page.total} (page ${page.page}).`);
      });
    });

  instruments
    .command('international')
    .description('List international (US-listed) instruments (paged).')
    .option('--search <text>', 'Filter by symbol / name.', '')
    .option('--exchange <name>', 'Filter by exchange (e.g. NASDAQ, NYSE).', '')
    .option('--page <n>', 'Page number (1-based).', '1')
    .option('--limit <n>', 'Page size.', '30')
    .action(async (opts: { search: string; exchange: string; page: string; limit: string }) => {
      const page = await instrumentsInternational(runtime, {
        search: opts.search,
        exchange: opts.exchange,
        page: Number(opts.page),
        pageSize: Number(opts.limit),
      });
      emit(page, () => {
        for (const item of page.items) {
          out(`${item.symbol}\t${item.exchange}\t${item.name}`);
        }
        out(`— ${page.items.length} shown of ${page.total} (page ${page.page}).`);
      });
    });

  instruments
    .command('prices')
    .description('Local instrument daily price history (~1y) with stats + sparkline.')
    .requiredOption('--id <idInstrumento>', 'Local instrument id (idInstrumento).')
    .action(async (opts: { id: string }) => {
      const result = await instrumentPrices(runtime, { id: Number(opts.id) });
      emit(result, () => {
        const { points, stats } = result;
        const first = points.at(0);
        const last = points.at(-1);
        const span = first && last ? ` ${first.date} → ${last.date}` : '';
        const pct = (f: number): string => `${(f * 100).toFixed(2)}%`;
        out(`Instrument ${result.idInstrumento} — ${points.length} daily prices${span}`);
        out(`  ${sparkline(points.map((p) => p.close))}`);
        out(
          `  return ${pct(stats.totalReturn)}   σ(daily) ${pct(stats.sigma)}` +
            `   min ${stats.min}   max ${stats.max}`,
        );
      });
    });
}
