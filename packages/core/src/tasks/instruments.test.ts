import { describe, expect, it } from 'vitest';
import {
  FakeHttpClient,
  FixedClock,
  MemoryTokenStore,
  fakeRuntime,
} from '../adapters/fake/index.js';
import { ApiError, ContractError, NotAuthenticatedError } from '../errors/index.js';
import {
  computeStats,
  instrumentPrices,
  instrumentsInternational,
  instrumentsLocal,
  sparkline,
} from './instruments.js';

const FRESH = (() => {
  const b64 = (s: string): string => Buffer.from(s, 'utf8').toString('base64url');
  return `${b64('{"alg":"none"}')}.${b64(JSON.stringify({ exp: 4_102_444_800 }))}.sig`; // year 2100
})();

const ONE_ROW = {
  result: [
    {
      idInstrumento: 52185,
      nemotecnico: 'BCI',
      dscInstrumento: '  Banco de Crédito e Inversiones  ',
      codSubClaseInstrumento: 'ACC',
      codClaseInstrumento: 'RV',
      codigoFamilia: 'FAM',
      codMoneda: 'CLP',
      codPais: 'CL',
      isin: 'CL0000000001',
    },
  ],
  total: 1,
};

describe('instrumentsLocal', () => {
  it('projects the curated envelope and sends the observed params', async () => {
    const http = new FakeHttpClient((req) => {
      // The task reaches the portal via a full URL built from config.ENDPOINTS.
      expect(req.url).toContain('/shared/Instrumentos/FiltrarInstrumentos');
      expect(req.params).toMatchObject({ page: 2, limit: 10, filterNemotecnico: 'BCI' });
      expect(req.headers?.Authorization).toBe('Bearer ' + FRESH);
      return { json: ONE_ROW };
    });
    const rt = fakeRuntime({ http, tokens: new MemoryTokenStore(FRESH) });

    const page = await instrumentsLocal(rt, { search: 'BCI', page: 2, limit: 10 });
    expect(page).toEqual({
      market: 'local',
      page: 2,
      pageSize: 10,
      total: 1,
      items: [
        {
          idInstrumento: 52185,
          nemotecnico: 'BCI',
          descripcion: 'Banco de Crédito e Inversiones',
          codSubClase: 'ACC',
          codClase: 'RV',
          codigoFamilia: 'FAM',
          codMoneda: 'CLP',
          codPais: 'CL',
          isin: 'CL0000000001',
        },
      ],
    });
  });

  it('raises NotAuthenticatedError when no token is cached', async () => {
    const rt = fakeRuntime({ tokens: new MemoryTokenStore(null) });
    await expect(instrumentsLocal(rt)).rejects.toBeInstanceOf(NotAuthenticatedError);
  });

  it('refreshes once on a 401 and retries the request', async () => {
    let calls = 0;
    const http = new FakeHttpClient((req) => {
      if (req.url.includes('/RefreshToken')) return { json: 'renewed-token' };
      calls += 1;
      // First data call 401s (proactive check missed); second (post-refresh) succeeds.
      if (calls === 1) return { status: 401, text: 'unauthorized' };
      expect(req.headers?.Authorization).toBe('Bearer renewed-token');
      return { json: ONE_ROW };
    });
    const tokens = new MemoryTokenStore(FRESH, 'me@mail.cl');
    const rt = fakeRuntime({ http, tokens, clock: new FixedClock(0) });

    const page = await instrumentsLocal(rt);
    expect(page.total).toBe(1);
    expect(await tokens.get()).toBe('renewed-token');
    // A renewal keeps the owner, so the next idempotent login still matches.
    expect(await tokens.username()).toBe('me@mail.cl');
  });

  it('a proactive renewal keeps the token owner', async () => {
    const http = new FakeHttpClient((req) =>
      req.url.includes('/RefreshToken') ? { json: 'renewed-token' } : { json: ONE_ROW },
    );
    // A token already past its exp is inside the proactive window.
    const expiring = (() => {
      const b64 = (s: string): string => Buffer.from(s, 'utf8').toString('base64url');
      return `${b64('{"alg":"none"}')}.${b64(JSON.stringify({ exp: 1 }))}.sig`;
    })();
    const tokens = new MemoryTokenStore(expiring, 'me@mail.cl');
    const rt = fakeRuntime({ http, tokens, clock: new FixedClock(1_000_000_000_000) });

    await instrumentsLocal(rt);
    expect(await tokens.get()).toBe('renewed-token');
    expect(await tokens.username()).toBe('me@mail.cl');
  });
});

// Synthetic international listing — the wire envelope is `{ items, totalCount }`
// (NOT `{ result, total }` like local). `id` is a made-up UUID (ADR-012).
const INTL_PAGE = {
  items: [
    {
      id: '00000000-0000-4000-8000-000000000001',
      cusip: null,
      assetClassName: 'us_equity',
      exchangeName: 'NASDAQ',
      symbol: 'AAPL',
      name: 'Apple Inc. Common Stock',
      status: 'active',
      tradable: true,
      shortable: true,
      fractionable: true,
    },
  ],
  totalCount: 13514,
};

describe('instrumentsInternational', () => {
  it('projects the curated envelope and sends the observed params', async () => {
    const http = new FakeHttpClient((req) => {
      expect(req.url).toContain('/frontoffice/shared/Asset');
      expect(req.params).toMatchObject({
        page: 2,
        pageSize: 5,
        search: 'aapl',
        exchangeName: 'NASDAQ',
      });
      expect(req.headers?.Authorization).toBe('Bearer ' + FRESH);
      return { json: INTL_PAGE };
    });
    const rt = fakeRuntime({ http, tokens: new MemoryTokenStore(FRESH) });

    const page = await instrumentsInternational(rt, {
      search: 'aapl',
      exchange: 'NASDAQ',
      page: 2,
      pageSize: 5,
    });
    expect(page).toEqual({
      market: 'international',
      page: 2,
      pageSize: 5,
      total: 13514,
      items: [
        {
          id: '00000000-0000-4000-8000-000000000001',
          symbol: 'AAPL',
          name: 'Apple Inc. Common Stock',
          exchange: 'NASDAQ',
          assetClass: 'us_equity',
          status: 'active',
          tradable: true,
          fractionable: true,
          shortable: true,
          cusip: null,
        },
      ],
    });
  });

  it('raises ContractError when the envelope lacks items / totalCount', async () => {
    const http = new FakeHttpClient(() => ({ json: { result: [], total: 0 } }));
    const rt = fakeRuntime({ http, tokens: new MemoryTokenStore(FRESH) });
    await expect(instrumentsInternational(rt)).rejects.toBeInstanceOf(ContractError);
  });

  it('raises NotAuthenticatedError when no token is cached', async () => {
    const rt = fakeRuntime({ tokens: new MemoryTokenStore(null) });
    await expect(instrumentsInternational(rt)).rejects.toBeInstanceOf(NotAuthenticatedError);
  });

  it('refreshes once on a 401 and retries the request', async () => {
    let calls = 0;
    const http = new FakeHttpClient((req) => {
      if (req.url.includes('/RefreshToken')) return { json: 'renewed-token' };
      calls += 1;
      if (calls === 1) return { status: 401, text: 'unauthorized' };
      expect(req.headers?.Authorization).toBe('Bearer renewed-token');
      return { json: INTL_PAGE };
    });
    const tokens = new MemoryTokenStore(FRESH);
    const rt = fakeRuntime({ http, tokens, clock: new FixedClock(0) });

    const page = await instrumentsInternational(rt);
    expect(page.total).toBe(13514);
    expect(await tokens.get()).toBe('renewed-token');
  });
});

// Three synthetic daily rows, deliberately out of chronological order.
const PRICE_ROWS = [
  { fecha: '2026-01-02T00:00:00', precio: 110 },
  { fecha: '2026-01-01T00:00:00', precio: 100 },
  { fecha: '2026-01-03T00:00:00', precio: 105 },
];

describe('computeStats', () => {
  it('is all-zero for an empty series', () => {
    expect(computeStats([])).toEqual({ totalReturn: 0, sigma: 0, min: 0, max: 0 });
  });

  it('has zero return and sigma for a single point', () => {
    expect(computeStats([{ date: '2026-01-01', close: 42 }])).toEqual({
      totalReturn: 0,
      sigma: 0,
      min: 42,
      max: 42,
    });
  });

  it('computes total return, min/max, and sample sigma of daily returns', () => {
    const stats = computeStats([
      { date: '2026-01-01', close: 100 },
      { date: '2026-01-02', close: 110 },
      { date: '2026-01-03', close: 105 },
    ]);
    expect(stats.min).toBe(100);
    expect(stats.max).toBe(110);
    expect(stats.totalReturn).toBeCloseTo(0.05, 10); // (105 - 100) / 100
    // daily returns [0.1, -0.0454545…]; sample std-dev (n-1).
    expect(stats.sigma).toBeCloseTo(0.1028519, 6);
  });

  it('guards divide-by-zero: a non-positive first/prev price yields zero return/sigma', () => {
    const stats = computeStats([
      { date: '2026-01-01', close: 0 },
      { date: '2026-01-02', close: 50 },
    ]);
    expect(stats).toEqual({ totalReturn: 0, sigma: 0, min: 0, max: 50 });
  });
});

describe('sparkline', () => {
  it('renders an empty string for no values', () => {
    expect(sparkline([])).toBe('');
  });

  it('renders a flat series as the lowest block', () => {
    expect(sparkline([5, 5, 5])).toBe('▁▁▁');
  });

  it('maps a full ascending ramp across all eight blocks', () => {
    expect(sparkline([0, 1, 2, 3, 4, 5, 6, 7])).toBe('▁▂▃▄▅▆▇█');
  });

  it('maps the extremes of a two-point series to lowest/highest', () => {
    expect(sparkline([1, 2])).toBe('▁█');
  });
});

describe('instrumentPrices', () => {
  it('projects the sorted envelope with stats and sends the observed param', async () => {
    const http = new FakeHttpClient((req) => {
      expect(req.url).toContain('/frontoffice/shared/PublicadorPrecio/GetPreciosInstrumento');
      expect(req.params).toMatchObject({ idInstrumento: 42 });
      expect(req.headers?.Authorization).toBe('Bearer ' + FRESH);
      return { json: PRICE_ROWS };
    });
    const rt = fakeRuntime({ http, tokens: new MemoryTokenStore(FRESH) });

    const history = await instrumentPrices(rt, { id: 42 });
    expect(history.market).toBe('local');
    expect(history.idInstrumento).toBe(42);
    expect(history.points).toEqual([
      { date: '2026-01-01', close: 100 },
      { date: '2026-01-02', close: 110 },
      { date: '2026-01-03', close: 105 },
    ]);
    expect(history.stats).toMatchObject({ min: 100, max: 110 });
    expect(history.stats.totalReturn).toBeCloseTo(0.05, 10);
  });

  it('raises a clear ApiError for an empty result (unknown / non-local id)', async () => {
    const http = new FakeHttpClient(() => ({ json: [] }));
    const rt = fakeRuntime({ http, tokens: new MemoryTokenStore(FRESH) });
    await expect(instrumentPrices(rt, { id: 999 })).rejects.toBeInstanceOf(ApiError);
    await expect(instrumentPrices(rt, { id: 999 })).rejects.toThrow(
      /No price history for instrument 999/,
    );
  });

  it('raises ContractError when the payload is not a JSON array', async () => {
    const http = new FakeHttpClient(() => ({ json: { unexpected: true } }));
    const rt = fakeRuntime({ http, tokens: new MemoryTokenStore(FRESH) });
    await expect(instrumentPrices(rt, { id: 42 })).rejects.toBeInstanceOf(ContractError);
  });

  it('raises NotAuthenticatedError when no token is cached', async () => {
    const rt = fakeRuntime({ tokens: new MemoryTokenStore(null) });
    await expect(instrumentPrices(rt, { id: 42 })).rejects.toBeInstanceOf(NotAuthenticatedError);
  });

  it('refreshes once on a 401 and retries the request', async () => {
    let calls = 0;
    const http = new FakeHttpClient((req) => {
      if (req.url.includes('/RefreshToken')) return { json: 'renewed-token' };
      calls += 1;
      if (calls === 1) return { status: 401, text: 'unauthorized' };
      expect(req.headers?.Authorization).toBe('Bearer renewed-token');
      return { json: PRICE_ROWS };
    });
    const tokens = new MemoryTokenStore(FRESH);
    const rt = fakeRuntime({ http, tokens, clock: new FixedClock(0) });

    const history = await instrumentPrices(rt, { id: 42 });
    expect(history.points).toHaveLength(3);
    expect(await tokens.get()).toBe('renewed-token');
  });
});
