import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { testing } from '@albertomarturelo/nemo-core';
import { buildProgram } from './program.js';
import { captureStdout, scriptedPrompters } from './test-helpers.js';

const { FakeHttpClient, MemoryTokenStore, fakeRuntime } = testing;

/** A token that never expires (year 2100), so reads don't trigger a refresh. */
const FRESH = (() => {
  const b64 = (s: string): string => Buffer.from(s, 'utf8').toString('base64url');
  return `${b64('{"alg":"none"}')}.${b64(JSON.stringify({ exp: 4_102_444_800 }))}.sig`;
})();

function run(
  runtime: ReturnType<typeof fakeRuntime>,
  argv: string[],
  prompters = scriptedPrompters({}),
) {
  return buildProgram(runtime, prompters).parseAsync(['node', 'nemo', ...argv]);
}

describe('nemo CLI', () => {
  let cap: ReturnType<typeof captureStdout>;
  afterEach(() => cap?.restore());

  it('auth status → JSON logged_out when there is no token', async () => {
    const rt = fakeRuntime();
    cap = captureStdout();
    await run(rt, ['auth', 'status']);
    expect(JSON.parse(cap.text())).toEqual({ authenticated: false, state: 'logged_out' });
  });

  it('instruments local → JSON envelope from the (faked) portal', async () => {
    const http = new FakeHttpClient(() => ({
      json: {
        result: [{ idInstrumento: 1, nemotecnico: 'BCI', dscInstrumento: 'Banco' }],
        total: 1,
      },
    }));
    const rt = fakeRuntime({ http, tokens: new MemoryTokenStore(FRESH) });
    cap = captureStdout();
    await run(rt, ['instruments', 'local', '--search', 'BCI']);
    const payload = JSON.parse(cap.text());
    expect(payload).toMatchObject({ market: 'local', total: 1 });
    expect(payload.items[0].nemotecnico).toBe('BCI');
  });

  it('instruments prices → JSON envelope with stats over a live session', async () => {
    const http = new FakeHttpClient((req) => {
      expect(req.params).toMatchObject({ idInstrumento: 42 });
      return {
        json: [
          { fecha: '2026-01-01T00:00:00', precio: 100 },
          { fecha: '2026-01-02T00:00:00', precio: 110 },
        ],
      };
    });
    const rt = fakeRuntime({ http, tokens: new MemoryTokenStore(FRESH) });
    cap = captureStdout();
    await run(rt, ['instruments', 'prices', '--id', '42']);
    const payload = JSON.parse(cap.text());
    expect(payload).toMatchObject({ market: 'local', idInstrumento: 42 });
    expect(payload.points).toHaveLength(2);
    expect(payload.stats).toMatchObject({ min: 100, max: 110 });
  });

  it('instruments prices --human → renders the stats line + sparkline', async () => {
    const http = new FakeHttpClient(() => ({
      json: [
        { fecha: '2026-01-01T00:00:00', precio: 100 },
        { fecha: '2026-01-02T00:00:00', precio: 110 },
      ],
    }));
    const rt = fakeRuntime({ http, tokens: new MemoryTokenStore(FRESH) });
    cap = captureStdout();
    await run(rt, ['instruments', 'prices', '--id', '42', '--human']);
    const text = cap.text();
    expect(text).toContain('Instrument 42 — 2 daily prices 2026-01-01 → 2026-01-02');
    expect(text).toContain('▁█'); // sparkline of the two-point ascending series
    expect(text).toContain('return 10.00%'); // (110 - 100) / 100
    expect(text).toContain('min 100   max 110');
  });

  it('instruments international → JSON envelope from the (faked) portal', async () => {
    const http = new FakeHttpClient((req) => {
      expect(req.params).toMatchObject({ search: 'aapl', exchangeName: 'NASDAQ', pageSize: 5 });
      return {
        json: {
          items: [
            {
              id: 'u1',
              symbol: 'AAPL',
              name: 'Apple Inc.',
              exchangeName: 'NASDAQ',
              tradable: true,
            },
          ],
          totalCount: 13514,
        },
      };
    });
    const rt = fakeRuntime({ http, tokens: new MemoryTokenStore(FRESH) });
    cap = captureStdout();
    await run(rt, [
      'instruments',
      'international',
      '--search',
      'aapl',
      '--exchange',
      'NASDAQ',
      '--limit',
      '5',
    ]);
    const payload = JSON.parse(cap.text());
    expect(payload).toMatchObject({ market: 'international', total: 13514 });
    expect(payload.items[0].symbol).toBe('AAPL');
  });

  it('auth login → prompts for the password and caches the token', async () => {
    const http = new FakeHttpClient(() => ({ json: { token: 'minted' } }));
    const tokens = new MemoryTokenStore();
    const rt = fakeRuntime({ http, tokens });
    cap = captureStdout();
    await run(
      rt,
      ['auth', 'login', '--user', 'me@mail.cl'],
      scriptedPrompters({ hidden: 'secret' }),
    );
    expect(JSON.parse(cap.text())).toEqual({ authenticated: true, username: 'me@mail.cl' });
    expect(await tokens.get()).toBe('minted');
  });

  it('cartera movements → classified JSON envelope from the (faked) portal', async () => {
    const http = new FakeHttpClient(() => ({
      json: [
        {
          idCajaCuenta: 7,
          dscCajaCuenta: 'Caja CLP',
          movimientos: [
            { movimiento: 'DIV;10-4-2026;BCI;3,5', abono: 3500, cargo: 0, codMoneda: 'CLP' },
          ],
        },
      ],
    }));
    const rt = fakeRuntime({ http, tokens: new MemoryTokenStore(FRESH) });
    cap = captureStdout();
    await run(rt, ['cartera', 'movements', '--desde', '2026-01-01', '--hasta', '2026-06-30']);
    const payload = JSON.parse(cap.text());
    expect(payload).toMatchObject({ from: '2026-01-01', to: '2026-06-30' });
    expect(payload.summary.totalDividends).toBe(3500);
    expect(payload.buckets[0].movements[0].kind).toBe('dividend');
  });

  it('cartera summary → holdings + P&L JSON envelope (synthetic, faked portal)', async () => {
    const http = new FakeHttpClient((req) => {
      // --no-dividends flips the query flag; --currency threads through.
      expect(req.params).toMatchObject({ codMonedaSld: 'USD', conDividendos: 'false' });
      return {
        json: [
          {
            clasificacion: 'RENTA FIJA',
            nemotecnico: 'CFISYNTHRF',
            codMonedaDflt: 'USD',
            valorPresenteCompraMonDflt: 1000,
            valorPresenteMercadoMonDflt: 1200,
            fechaConsulta: '2026-07-07T00:00:00',
          },
        ],
      };
    });
    const rt = fakeRuntime({ http, tokens: new MemoryTokenStore(FRESH) });
    cap = captureStdout();
    await run(rt, ['cartera', 'summary', '--currency', 'USD', '--no-dividends']);
    const payload = JSON.parse(cap.text());
    expect(payload).toMatchObject({ currency: 'USD', queryDate: '2026-07-07' });
    expect(payload.holdings[0]).toMatchObject({ nemotecnico: 'CFISYNTHRF', pnl: 200 });
    expect(payload.totals).toMatchObject({ costBasis: 1000, marketValue: 1200, pnl: 200 });
  });

  it('cartera saldo → cash-balance JSON envelope (synthetic, faked portal)', async () => {
    const http = new FakeHttpClient((req) => {
      expect(req.params).toMatchObject({
        id: 0,
        tipo: 'Cuenta',
        codMonedaSld: 'CLP',
        fecha: '2026-07-31',
      });
      return {
        json: [
          {
            idCajaCuenta: 900001,
            monto: 125_000,
            numCuenta: '99999999/0',
            codMoneda: 'CLP',
            codMercado: 'N',
            identificador: '99999999-0',
            montoConvertido: 125_000,
          },
        ],
      };
    });
    const rt = fakeRuntime({ http, tokens: new MemoryTokenStore(FRESH) });
    cap = captureStdout();
    await run(rt, ['cartera', 'saldo', '--fecha', '2026-07-31']);
    const payload = JSON.parse(cap.text());
    expect(payload).toMatchObject({ currency: 'CLP', fecha: '2026-07-31', total: 125_000 });
    expect(payload.balances[0]).toMatchObject({ bucketId: 900001, amountConverted: 125_000 });
  });

  it('cartera saldo --human → renders one line per caja plus the total', async () => {
    const http = new FakeHttpClient(() => ({
      json: [
        {
          numCuenta: '99999999/0',
          codMoneda: 'USD',
          codMercado: 'I',
          monto: 200,
          montoConvertido: 190_000,
        },
      ],
    }));
    const rt = fakeRuntime({ http, tokens: new MemoryTokenStore(FRESH) });
    cap = captureStdout();
    await run(rt, ['cartera', 'saldo', '--fecha', '2026-07-31', '--human']);
    const text = cap.text();
    expect(text).toContain('Saldo caja (CLP) @ 2026-07-31');
    expect(text).toContain('200 USD');
    expect(text).toContain('TOTAL\t190000 CLP');
  });

  it('reports the published package version', () => {
    // `--version` is a literal in program.ts while a release bumps package.json
    // (the tag/version gate reads package.json, ADR-015). Once the CLI is
    // installable from npm that literal is the ONLY way a user can tell what
    // they have, so drift between the two must fail here, not in the field.
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
      version: string;
    };
    expect(buildProgram(fakeRuntime()).version()).toBe(pkg.version);
  });
});
