import { describe, expect, it } from 'vitest';
import {
  FakeHttpClient,
  FixedClock,
  MemoryTokenStore,
  fakeRuntime,
} from '../adapters/fake/index.js';
import { NotAuthenticatedError } from '../errors/index.js';
import { instrumentsLocal } from './instruments.js';

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
    const tokens = new MemoryTokenStore(FRESH);
    const rt = fakeRuntime({ http, tokens, clock: new FixedClock(0) });

    const page = await instrumentsLocal(rt);
    expect(page.total).toBe(1);
    expect(await tokens.get()).toBe('renewed-token');
  });
});
