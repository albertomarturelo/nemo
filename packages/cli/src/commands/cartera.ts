// `nemo cartera …` — cartera (portfolio) reads. First subcommand: movements. Later
// reads (summary) add a sibling here. Append-only: one `registerCartera` call from
// program.ts (ADR-007).
import type { Command } from 'commander';
import {
  carteraMovements,
  carteraSaldo,
  carteraSummary,
  type Runtime,
} from '@albertomarturelo/nemo-core';
import { emit, out } from '../io.js';

export function registerCartera(program: Command, runtime: Runtime): void {
  const cartera = program.command('cartera').description('Inspect your portfolio.');

  cartera
    .command('movements')
    .description('List cash movements over a date range, classified per kind.')
    .option('--desde <date>', 'Start date YYYY-MM-DD (default: 1 year ago).')
    .option('--hasta <date>', 'End date YYYY-MM-DD (default: today).')
    .option('--account-id <id>', 'Account id to filter on (0 = all accounts).', '0')
    .action(async (opts: { desde?: string; hasta?: string; accountId: string }) => {
      const result = await carteraMovements(runtime, {
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

  cartera
    .command('summary')
    .description('List holdings with computed P&L and totals by classification.')
    .option('--account-id <id>', 'Account id to filter on (0 = all accounts).', '0')
    .option('--currency <code>', 'Valuation currency, e.g. CLP or USD.', 'CLP')
    // Dividends are folded into the valuation by default. `--no-dividends` sets
    // commander's `dividends` to false; `--with-dividends` is the explicit positive.
    .option('--with-dividends', 'Include accrued dividends in the valuation (default).')
    .option('--no-dividends', 'Exclude accrued dividends from the valuation.')
    .action(
      async (opts: {
        accountId: string;
        currency: string;
        dividends: boolean;
        withDividends?: boolean;
      }) => {
        const result = await carteraSummary(runtime, {
          accountId: Number(opts.accountId),
          currency: opts.currency,
          // --with-dividends forces it on; otherwise honour commander's `dividends`
          // (true unless --no-dividends was passed).
          withDividends: opts.withDividends === true ? true : opts.dividends,
        });
        emit(result, () => {
          const pct = (f: number): string => `${(f * 100).toFixed(2)}%`;
          const asOf = result.queryDate ? ` @ ${result.queryDate}` : '';
          out(`Cartera (${result.currency})${asOf}`);
          for (const h of result.holdings)
            out(
              `  ${h.nemotecnico}\t${h.quantity}\t${h.marketValue}\tP&L ${h.pnl} (${pct(h.pnlPct)})`,
            );
          out('  ── by classification ──');
          for (const c of result.totalsByClassification)
            out(`  ${c.classification}\t${c.marketValue}\tP&L ${c.pnl} (${pct(c.pnlPct)})`);
          const t = result.totals;
          out(`  TOTAL\t${t.marketValue}\tP&L ${t.pnl} (${pct(t.pnlPct)})`);
        });
      },
    );

  cartera
    .command('saldo')
    .description('Show the cash balance of every caja, valued in one currency.')
    .option('--account-id <id>', 'Account id to filter on (0 = all accounts).', '0')
    .option('--currency <code>', 'Valuation currency, e.g. CLP or USD.', 'CLP')
    .option('--fecha <date>', 'Balance date YYYY-MM-DD (default: today).')
    .action(async (opts: { accountId: string; currency: string; fecha?: string }) => {
      const result = await carteraSaldo(runtime, {
        accountId: Number(opts.accountId),
        currency: opts.currency,
        ...(opts.fecha !== undefined ? { fecha: opts.fecha } : {}),
      });
      emit(result, () => {
        out(`Saldo caja (${result.currency}) @ ${result.fecha}`);
        for (const b of result.balances)
          out(`  ${b.account}\t${b.market}\t${b.amount} ${b.currency}\t→ ${b.amountConverted}`);
        out(`  TOTAL\t${result.total} ${result.currency}`);
      });
    });
}
