// `nemo instruments …` — market data reads. The first ported read surface; later
// ones (international, prices) add a sibling subcommand here. Append-only: one
// `registerInstruments` call from program.ts (ADR-007).
import type { Command } from 'commander';
import { instrumentsLocal, type Runtime } from '@albertomarturelo/nemo-core';
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
}
