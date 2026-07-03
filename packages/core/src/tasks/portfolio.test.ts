import { describe, expect, it } from 'vitest';
import {
  FakeHttpClient,
  FixedClock,
  MemoryTokenStore,
  fakeRuntime,
} from '../adapters/fake/index.js';
import { NotAuthenticatedError } from '../errors/index.js';
import {
  classifyMovement,
  portfolioMovements,
  summarizeMovements,
  type Movement,
} from './portfolio.js';

const FRESH = (() => {
  const b64 = (s: string): string => Buffer.from(s, 'utf8').toString('base64url');
  return `${b64('{"alg":"none"}')}.${b64(JSON.stringify({ exp: 4_102_444_800 }))}.sig`; // year 2100
})();

/** Build a Movement with sensible defaults; override what the test cares about. */
function mv(partial: Partial<Movement>): Movement {
  return {
    bucketId: 1,
    bucketName: 'CLP',
    account: '123',
    sequence: 1,
    date: '2026-05-01',
    settlementDate: '2026-05-03',
    description: '',
    kind: 'other',
    credit: 0,
    debit: 0,
    balance: 0,
    currency: 'CLP',
    dividend: null,
    trade: null,
    ...partial,
  };
}

describe('classifyMovement', () => {
  it('parses a dividend (DIV;dd-mm-yyyy;nemo;amount)', () => {
    expect(classifyMovement('DIV;15-3-2026;BCI;12,34', 5000, 0)).toEqual({
      kind: 'dividend',
      dividend: { exDate: '2026-03-15', nemotecnico: 'BCI', perUnitAmount: 12.34 },
      trade: null,
    });
  });

  it('parses a buy and a sell (COMPRA/VENTA FONDOS CB - <nemo>)', () => {
    expect(classifyMovement('COMPRA FONDOS CB - BCI', 0, 100_000)).toEqual({
      kind: 'buy',
      dividend: null,
      trade: { nemotecnico: 'BCI', side: 'buy' },
    });
    expect(classifyMovement('VENTA FONDOS CB - AGUAS-A', 90_000, 0).kind).toBe('sell');
  });

  it('recognises the commission text', () => {
    expect(classifyMovement('COMISION TRANSACCIÓN BOLSA', 0, 500).kind).toBe('commission');
  });

  it('classifies a RUT-described row by credit/debit direction', () => {
    expect(classifyMovement('12.345.678-9', 200_000, 0).kind).toBe('cash_in');
    expect(classifyMovement('12.345.678-9', 0, 200_000).kind).toBe('cash_out');
  });

  it('falls back to other for an unrecognised description', () => {
    expect(classifyMovement('ALGO RARO', 1, 0).kind).toBe('other');
  });
});

describe('summarizeMovements', () => {
  it('accumulates totals and sorts the per-instrument aggregates', () => {
    const movements: Movement[] = [
      mv({ kind: 'cash_in', credit: 100 }),
      mv({ kind: 'cash_out', debit: 40 }),
      mv({ kind: 'commission', debit: 5 }),
      mv({
        kind: 'dividend',
        credit: 30,
        dividend: { exDate: null, nemotecnico: 'BCI', perUnitAmount: 1 },
      }),
      mv({
        kind: 'dividend',
        credit: 70,
        dividend: { exDate: null, nemotecnico: 'AGUAS', perUnitAmount: 1 },
      }),
      mv({ kind: 'buy', debit: 200, trade: { nemotecnico: 'BCI', side: 'buy' } }),
      mv({ kind: 'sell', credit: 150, trade: { nemotecnico: 'BCI', side: 'sell' } }),
      mv({ kind: 'other', credit: 999 }), // ignored by every total
    ];
    const s = summarizeMovements(movements);
    expect(s).toMatchObject({
      totalCashIn: 100,
      totalCashOut: 40,
      totalCommissions: 5,
      totalDividends: 100,
      totalBuys: 200,
      totalSells: 150,
    });
    // byDividend sorted by totalReceived desc.
    expect(s.byDividend.map((d) => d.nemotecnico)).toEqual(['AGUAS', 'BCI']);
    // byTrade sorted by (nemotecnico, side).
    expect(s.byTrade).toEqual([
      { nemotecnico: 'BCI', side: 'buy', totalAmount: 200, occurrences: 1 },
      { nemotecnico: 'BCI', side: 'sell', totalAmount: 150, occurrences: 1 },
    ]);
  });
});

const ONE_BUCKET = [
  {
    idCajaCuenta: 7,
    dscCajaCuenta: 'Caja CLP',
    movimientos: [
      {
        movimiento: 'DIV;10-4-2026;BCI;3,5',
        abono: 3500,
        cargo: 0,
        saldo: 3500,
        codMoneda: 'CLP',
        fechaMovimiento: '2026-04-10T00:00:00',
        orden: 1,
        numCuenta: '999',
      },
      {
        movimiento: 'COMISION TRANSACCIÓN BOLSA',
        abono: 0,
        cargo: 500,
        saldo: 3000,
        codMoneda: 'CLP',
        fechaMovimiento: '2026-04-11T00:00:00',
        orden: 2,
        numCuenta: '999',
      },
    ],
  },
];

describe('portfolioMovements', () => {
  it('maps buckets + a grand summary and defaults the window from the Clock seam', async () => {
    const clockMs = Date.UTC(2026, 6, 3); // 2026-07-03
    const http = new FakeHttpClient((req) => {
      expect(req.url).toContain('/frontoffice/shared/MovimientosCajas/Movimientos');
      expect(req.params).toMatchObject({
        id: 0,
        tipo: 'Cuenta',
        desde: '2025-07-03',
        hasta: '2026-07-03',
      });
      return { json: ONE_BUCKET };
    });
    const rt = fakeRuntime({
      http,
      tokens: new MemoryTokenStore(FRESH),
      clock: new FixedClock(clockMs),
    });

    const result = await portfolioMovements(rt);
    expect(result.from).toBe('2025-07-03');
    expect(result.to).toBe('2026-07-03');
    expect(result.buckets).toHaveLength(1);
    expect(result.buckets[0]?.movements[0]?.kind).toBe('dividend');
    expect(result.summary.totalDividends).toBe(3500);
    expect(result.summary.totalCommissions).toBe(500);
    expect(result.summary.byDividend).toEqual([
      { nemotecnico: 'BCI', totalReceived: 3500, occurrences: 1 },
    ]);
  });

  it('raises NotAuthenticatedError when no token is cached', async () => {
    const rt = fakeRuntime({ tokens: new MemoryTokenStore(null) });
    await expect(portfolioMovements(rt)).rejects.toBeInstanceOf(NotAuthenticatedError);
  });

  it('refreshes once on a 401 and retries', async () => {
    let dataCalls = 0;
    const http = new FakeHttpClient((req) => {
      if (req.url.includes('/RefreshToken')) return { json: 'renewed' };
      dataCalls += 1;
      if (dataCalls === 1) return { status: 401, text: 'unauthorized' };
      return { json: ONE_BUCKET };
    });
    const tokens = new MemoryTokenStore(FRESH);
    const rt = fakeRuntime({ http, tokens, clock: new FixedClock(0) });

    const result = await portfolioMovements(rt, { desde: '2026-01-01', hasta: '2026-06-30' });
    expect(result.buckets).toHaveLength(1);
    expect(await tokens.get()).toBe('renewed');
  });
});
