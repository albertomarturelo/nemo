import { describe, expect, it } from 'vitest';
import {
  FakeHttpClient,
  FixedClock,
  MemoryTokenStore,
  fakeRuntime,
} from '../adapters/fake/index.js';
import { ApiError, ContractError, NotAuthenticatedError } from '../errors/index.js';
import {
  classifyMovement,
  carteraMovements,
  carteraSaldo,
  carteraSummary,
  computePnl,
  summarizeHoldings,
  summarizeMovements,
  type Holding,
  type Movement,
} from './cartera.js';

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
    expect(classifyMovement('11.111.111-1', 200_000, 0).kind).toBe('cash_in');
    expect(classifyMovement('11.111.111-1', 0, 200_000).kind).toBe('cash_out');
  });

  it('parses a thousands-formatted dividend amount (Chilean number format)', () => {
    const r = classifyMovement('DIV;1-1-2026;BCI;1.234,56', 1000, 0);
    expect(r.dividend?.perUnitAmount).toBe(1234.56);
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

describe('carteraMovements', () => {
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

    const result = await carteraMovements(rt);
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
    await expect(carteraMovements(rt)).rejects.toBeInstanceOf(NotAuthenticatedError);
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

    const result = await carteraMovements(rt, { desde: '2026-01-01', hasta: '2026-06-30' });
    expect(result.buckets).toHaveLength(1);
    expect(await tokens.get()).toBe('renewed');
  });
});

// ── Summary (holdings + P&L) ────────────────────────────────────────────────
// All fixtures below are SYNTHETIC (ADR-012): invented amounts, account, nemos.

/** Build a Holding with sensible defaults; override what the test cares about. */
function hd(partial: Partial<Holding>): Holding {
  return {
    account: '99999999/0',
    accountName: 'SYNTHETIC ACCOUNT',
    classification: 'RENTA FIJA',
    subClassification: 'Sub',
    instrumentId: 1,
    nemotecnico: 'CFISYNTH',
    description: 'Synthetic fund',
    instrumentSubclass: 'CFI',
    series: null,
    currency: 'CLP',
    quantity: 1,
    avgBuyPrice: 0,
    marketPrice: 0,
    costBasis: 0,
    marketValue: 0,
    pnl: 0,
    pnlPct: 0,
    queryDate: null,
    ...partial,
  };
}

/** A synthetic raw holding row in the portal's wire shape (real field names). */
function rawHolding(over: Record<string, unknown>): Record<string, unknown> {
  return {
    numCuenta: '99999999/0',
    cuenta: '99999999/0',
    dscCuenta: 'SYNTHETIC ACCOUNT',
    clasificacion: 'RENTA FIJA',
    subClasificacion: 'Inversiones Alternativas',
    idInstrumento: 1000,
    nemotecnico: 'CFISYNTHRF',
    dscInstrumento: 'SYNTHETIC FIXED INCOME FUND',
    codSubClaseInstrumento: 'CFI',
    serie: null,
    codMonedaDflt: 'CLP',
    cantidad: 10,
    tasaPrecioCompra: 100,
    tasaPrecio: 120,
    valorPresenteCompraMonDflt: 1000,
    valorPresenteMercadoMonDflt: 1200,
    fechaConsulta: '2026-07-06T00:00:00',
    ...over,
  };
}

const RENTA_FIJA_HOLDING = rawHolding({ fechaConsulta: '2026-07-07T00:00:00' });
const RENTA_VARIABLE_HOLDING = rawHolding({
  clasificacion: 'RENTA VARIABLE',
  subClasificacion: 'Fondos Mutuos RV Nacional',
  idInstrumento: 2000,
  nemotecnico: 'CFISYNTHRV',
  dscInstrumento: 'SYNTHETIC EQUITY FUND, A',
  serie: 'A         ', // space-padded on the wire → trimmed to 'A'
  cantidad: 5,
  tasaPrecioCompra: 100,
  tasaPrecio: 80,
  valorPresenteCompraMonDflt: 500,
  valorPresenteMercadoMonDflt: 400,
  fechaConsulta: '2026-07-06T00:00:00',
});

describe('computePnl', () => {
  it('computes gain / loss and guards a non-positive cost basis', () => {
    expect(computePnl(1000, 1200)).toEqual({ pnl: 200, pnlPct: 0.2 });
    expect(computePnl(500, 400)).toEqual({ pnl: -100, pnlPct: -0.2 });
    expect(computePnl(0, 50)).toEqual({ pnl: 50, pnlPct: 0 }); // divest → no divide-by-zero
    expect(computePnl(-10, 5)).toEqual({ pnl: 15, pnlPct: 0 });
  });
});

describe('summarizeHoldings', () => {
  it('groups by classification (sorted) and grand-totals, empty-safe on []', () => {
    const holdings = [
      hd({ classification: 'RENTA VARIABLE', costBasis: 500, marketValue: 400 }),
      hd({ classification: 'RENTA FIJA', costBasis: 1000, marketValue: 1200 }),
      hd({ classification: 'RENTA FIJA', costBasis: 0, marketValue: 50 }),
    ];
    const { totalsByClassification, totals } = summarizeHoldings(holdings);
    expect(totalsByClassification.map((c) => c.classification)).toEqual([
      'RENTA FIJA',
      'RENTA VARIABLE',
    ]);
    expect(totalsByClassification[0]).toMatchObject({
      costBasis: 1000,
      marketValue: 1250,
      pnl: 250,
      pnlPct: 0.25,
    });
    expect(totals).toMatchObject({ costBasis: 1500, marketValue: 1650, pnl: 150 });
    expect(totals.pnlPct).toBeCloseTo(0.1);

    expect(summarizeHoldings([])).toEqual({
      totalsByClassification: [],
      totals: { costBasis: 0, marketValue: 0, pnl: 0, pnlPct: 0 },
    });
  });
});

describe('carteraSummary', () => {
  it('maps holdings, computes P&L, trims `serie`, and totals by classification', async () => {
    const http = new FakeHttpClient((req) => {
      expect(req.url).toContain('/frontoffice/shared/cartera/CierreCarteraResumidaOnline');
      expect(req.params).toMatchObject({
        id: 0,
        tipo: 'Cuenta',
        codMonedaSld: 'CLP',
        conDividendos: 'true',
      });
      return { json: [RENTA_FIJA_HOLDING, RENTA_VARIABLE_HOLDING] };
    });
    const rt = fakeRuntime({ http, tokens: new MemoryTokenStore(FRESH) });

    const result = await carteraSummary(rt);
    expect(result.currency).toBe('CLP');
    expect(result.queryDate).toBe('2026-07-07'); // latest fechaConsulta across rows
    expect(result.holdings).toHaveLength(2);

    const rv = result.holdings.find((h) => h.nemotecnico === 'CFISYNTHRV');
    expect(rv?.series).toBe('A'); // space-padded on the wire, trimmed here
    expect(rv?.pnl).toBe(-100);
    expect(rv?.pnlPct).toBe(-0.2);

    expect(result.totalsByClassification.map((c) => c.classification)).toEqual([
      'RENTA FIJA',
      'RENTA VARIABLE',
    ]);
    expect(result.totals).toMatchObject({ costBasis: 1500, marketValue: 1600, pnl: 100 });
  });

  it('trims a blank `serie` (whitespace-only) to null', async () => {
    const http = new FakeHttpClient(() => ({ json: [rawHolding({ serie: '   ' })] }));
    const rt = fakeRuntime({ http, tokens: new MemoryTokenStore(FRESH) });
    const result = await carteraSummary(rt);
    expect(result.holdings[0]?.series).toBeNull();
  });

  it('threads currency + --no-dividends into the query and is empty-safe', async () => {
    const http = new FakeHttpClient((req) => {
      expect(req.params).toMatchObject({ codMonedaSld: 'USD', conDividendos: 'false' });
      return { json: [] };
    });
    const rt = fakeRuntime({ http, tokens: new MemoryTokenStore(FRESH) });

    const result = await carteraSummary(rt, { currency: 'USD', withDividends: false });
    expect(result.currency).toBe('USD');
    expect(result.queryDate).toBeNull();
    expect(result.holdings).toEqual([]);
    expect(result.totals).toEqual({ costBasis: 0, marketValue: 0, pnl: 0, pnlPct: 0 });
  });

  it('raises NotAuthenticatedError when no token is cached', async () => {
    const rt = fakeRuntime({ tokens: new MemoryTokenStore(null) });
    await expect(carteraSummary(rt)).rejects.toBeInstanceOf(NotAuthenticatedError);
  });

  it('raises ContractError when the body is not a JSON array', async () => {
    const http = new FakeHttpClient(() => ({ json: { unexpected: true } }));
    const rt = fakeRuntime({ http, tokens: new MemoryTokenStore(FRESH) });
    await expect(carteraSummary(rt)).rejects.toBeInstanceOf(ContractError);
  });

  it('refreshes once on a 401 and retries', async () => {
    let dataCalls = 0;
    const http = new FakeHttpClient((req) => {
      if (req.url.includes('/RefreshToken')) return { json: 'renewed' };
      dataCalls += 1;
      if (dataCalls === 1) return { status: 401, text: 'unauthorized' };
      return { json: [RENTA_FIJA_HOLDING] };
    });
    const tokens = new MemoryTokenStore(FRESH);
    const rt = fakeRuntime({ http, tokens, clock: new FixedClock(0) });

    const result = await carteraSummary(rt);
    expect(result.holdings).toHaveLength(1);
    expect(await tokens.get()).toBe('renewed');
  });
});

// ── Saldo caja (cash balance) ───────────────────────────────────────────────
// All fixtures below are SYNTHETIC (ADR-012): invented amounts and account numbers.

/** A synthetic raw saldo row in the portal's wire shape (real field names). */
function rawSaldo(over: Record<string, unknown>): Record<string, unknown> {
  return {
    idCajaCuenta: 900001,
    monto: 125_000,
    numCuenta: '99999999/0',
    codMoneda: 'CLP',
    codMercado: 'N',
    identificador: '99999999-0',
    montoConvertido: 125_000,
    ...over,
  };
}

describe('carteraSaldo', () => {
  it('maps every caja, totals the converted amounts, and defaults `fecha` from the Clock seam', async () => {
    const clockMs = Date.UTC(2026, 6, 31); // 2026-07-31
    const http = new FakeHttpClient((req) => {
      expect(req.url).toContain('/frontoffice/shared/Dashboard/ResumenSaldoCaja');
      expect(req.params).toMatchObject({
        id: 0,
        tipo: 'Cuenta',
        codMonedaSld: 'CLP',
        fecha: '2026-07-31',
      });
      return {
        json: [
          rawSaldo({}),
          // A USD caja: `monto` stays in USD, `montoConvertido` is its CLP valuation.
          rawSaldo({
            idCajaCuenta: 900002,
            codMoneda: 'USD',
            codMercado: 'I',
            monto: 200,
            montoConvertido: 190_000,
          }),
        ],
      };
    });
    const rt = fakeRuntime({
      http,
      tokens: new MemoryTokenStore(FRESH),
      clock: new FixedClock(clockMs),
    });

    const result = await carteraSaldo(rt);
    expect(result.currency).toBe('CLP');
    expect(result.fecha).toBe('2026-07-31');
    expect(result.balances).toHaveLength(2);
    expect(result.balances[0]).toEqual({
      bucketId: 900001,
      account: '99999999/0',
      identifier: '99999999-0',
      currency: 'CLP',
      market: 'N',
      amount: 125_000,
      amountConverted: 125_000,
    });
    // Only the converted amounts share a currency, so only they are summable.
    expect(result.total).toBe(315_000);
  });

  it('threads accountId + currency + an explicit fecha into the query and is empty-safe', async () => {
    const http = new FakeHttpClient((req) => {
      expect(req.params).toMatchObject({ id: 42, codMonedaSld: 'USD', fecha: '2026-01-23' });
      return { json: [] };
    });
    const rt = fakeRuntime({ http, tokens: new MemoryTokenStore(FRESH) });

    const result = await carteraSaldo(rt, { accountId: 42, currency: 'USD', fecha: '2026-01-23' });
    expect(result).toEqual({ currency: 'USD', fecha: '2026-01-23', balances: [], total: 0 });
  });

  it('fills a missing field with an empty/zero instead of crashing', async () => {
    const http = new FakeHttpClient(() => ({ json: [{ idCajaCuenta: 900003 }] }));
    const rt = fakeRuntime({ http, tokens: new MemoryTokenStore(FRESH) });

    const result = await carteraSaldo(rt);
    expect(result.balances[0]).toEqual({
      bucketId: 900003,
      account: '',
      identifier: '',
      currency: '',
      market: '',
      amount: 0,
      amountConverted: 0,
    });
    expect(result.total).toBe(0);
  });

  it('passes the portal error body through as an ApiError', async () => {
    const http = new FakeHttpClient(() => ({ status: 500, text: 'saldo unavailable' }));
    const rt = fakeRuntime({ http, tokens: new MemoryTokenStore(FRESH) });

    await expect(carteraSaldo(rt)).rejects.toBeInstanceOf(ApiError);
    await expect(carteraSaldo(rt)).rejects.toThrow(/saldo unavailable/);
  });

  it('raises ContractError when the body is not a JSON array', async () => {
    const http = new FakeHttpClient(() => ({ json: { unexpected: true } }));
    const rt = fakeRuntime({ http, tokens: new MemoryTokenStore(FRESH) });
    await expect(carteraSaldo(rt)).rejects.toBeInstanceOf(ContractError);
  });

  it('raises NotAuthenticatedError when no token is cached', async () => {
    const rt = fakeRuntime({ tokens: new MemoryTokenStore(null) });
    await expect(carteraSaldo(rt)).rejects.toBeInstanceOf(NotAuthenticatedError);
  });
});
