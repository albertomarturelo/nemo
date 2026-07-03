// `nemo portfolio …` — portfolio reads. First subcommand: movements. Later reads
// (summary) add a sibling here. Append-only: one `registerPortfolio` call from
// program.ts (ADR-007).
import type { Command } from 'commander';
import { portfolioMovements, type Runtime } from '@albertomarturelo/nemo-core';
import { emit, out } from '../io.js';

export function registerPortfolio(program: Command, runtime: Runtime): void {
  const portfolio = program.command('portfolio').description('Inspect your portfolio.');

  portfolio
    .command('movements')
    .description('List cash movements over a date range, classified per kind.')
    .option('--desde <date>', 'Start date YYYY-MM-DD (default: 1 year ago).')
    .option('--hasta <date>', 'End date YYYY-MM-DD (default: today).')
    .option('--account-id <id>', 'Account id to filter on (0 = all accounts).', '0')
    .action(async (opts: { desde?: string; hasta?: string; accountId: string }) => {
      const result = await portfolioMovements(runtime, {
        ...(opts.desde !== undefined ? { desde: opts.desde } : {}),
        ...(opts.hasta !== undefined ? { hasta: opts.hasta } : {}),
        accountId: Number(opts.accountId),
      });
      emit(result, () => {
        const s = result.summary;
        out(`Movements ${result.from} → ${result.to}`);
        out(`  cash in  +${s.totalCashIn}   cash out -${s.totalCashOut}`);
        out(`  dividends +${s.totalDividends}   commissions -${s.totalCommissions}`);
        out(`  buys -${s.totalBuys}   sells +${s.totalSells}`);
        for (const d of s.byDividend)
          out(`  DIV ${d.nemotecnico}\t${d.occurrences}×\t+${d.totalReceived}`);
        for (const t of s.byTrade)
          out(`  ${t.side.toUpperCase()} ${t.nemotecnico}\t${t.occurrences}×\t${t.totalAmount}`);
      });
    });
}
