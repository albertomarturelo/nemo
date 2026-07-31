// Server-level tests: the tool/resource surface + the auth/read tools. Asserts the
// ADR-006 invariant — NO tool accepts a password, and there is NO sign-in tool at
// all. Fakes only, no network.
import { describe, expect, it } from 'vitest';
import { testing } from '@albertomarturelo/nemo-core';
import {
  connect,
  FRESH_TOKEN,
  isError,
  makeRuntime,
  propKeys,
  resourceText,
  toolText,
} from './test-helpers.js';

describe('@nemo/mcp server (in-memory client, fake runtime, no network)', () => {
  it('exposes the read tools — and NO credential-taking tool exists', async () => {
    const client = await connect(makeRuntime());
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual([
      'auth_logout',
      'auth_status',
      'cartera_movements',
      'cartera_saldo',
      'cartera_summary',
      'instrument_prices',
      'instruments_international',
      'instruments_local',
    ]);

    // ADR-006: no sign-in tool, and no tool INPUT FIELD accepts a password.
    expect(names).not.toContain('auth_login');
    const allInputKeys = tools.flatMap((t) => propKeys(t.inputSchema));
    expect(allInputKeys.some((k) => /password|clave|user/i.test(k))).toBe(false);
  });

  it('exposes the orientation resources', async () => {
    const client = await connect(makeRuntime());
    const { resources } = await client.listResources();
    expect(resources.map((r) => r.uri).sort()).toEqual(['nemo://config', 'nemo://session']);
    const cfg = await client.readResource({ uri: 'nemo://config' });
    expect(resourceText(cfg)).toContain('portalclientes.vectorcapital.cl');
  });

  it('auth_status reports logged_out before login', async () => {
    const client = await connect(makeRuntime());
    const res = await client.callTool({ name: 'auth_status', arguments: {} });
    expect(toolText(res)).toContain('logged_out');
  });

  it('instruments_local returns the curated envelope over a live session', async () => {
    const http = new testing.FakeHttpClient(() => ({
      json: {
        result: [{ idInstrumento: 1, nemotecnico: 'BCI', dscInstrumento: 'Banco' }],
        total: 1,
      },
    }));
    const client = await connect(
      makeRuntime({ http, tokens: new testing.MemoryTokenStore(FRESH_TOKEN) }),
    );
    const res = await client.callTool({ name: 'instruments_local', arguments: { search: 'BCI' } });
    const payload = JSON.parse(toolText(res));
    expect(payload).toMatchObject({ market: 'local', total: 1 });
    expect(isError(res)).toBe(false);
  });

  it('cartera_movements returns the classified envelope over a live session', async () => {
    const http = new testing.FakeHttpClient(() => ({
      json: [
        {
          idCajaCuenta: 7,
          dscCajaCuenta: 'Caja CLP',
          movimientos: [
            { movimiento: 'COMISION TRANSACCIÓN BOLSA', abono: 0, cargo: 500, codMoneda: 'CLP' },
          ],
        },
      ],
    }));
    const client = await connect(
      makeRuntime({ http, tokens: new testing.MemoryTokenStore(FRESH_TOKEN) }),
    );
    const res = await client.callTool({
      name: 'cartera_movements',
      arguments: { desde: '2026-01-01', hasta: '2026-06-30' },
    });
    const payload = JSON.parse(toolText(res));
    expect(payload.summary.totalCommissions).toBe(500);
    expect(isError(res)).toBe(false);
  });

  it('cartera_summary returns the holdings + P&L envelope over a live session', async () => {
    const http = new testing.FakeHttpClient((req) => {
      expect(req.params).toMatchObject({ codMonedaSld: 'CLP', conDividendos: 'true' });
      return {
        json: [
          {
            clasificacion: 'RENTA FIJA',
            nemotecnico: 'CFISYNTHRF',
            codMonedaDflt: 'CLP',
            valorPresenteCompraMonDflt: 1000,
            valorPresenteMercadoMonDflt: 1200,
            fechaConsulta: '2026-07-07T00:00:00',
          },
        ],
      };
    });
    const client = await connect(
      makeRuntime({ http, tokens: new testing.MemoryTokenStore(FRESH_TOKEN) }),
    );
    const res = await client.callTool({ name: 'cartera_summary', arguments: {} });
    const payload = JSON.parse(toolText(res));
    expect(payload.currency).toBe('CLP');
    expect(payload.holdings[0].pnl).toBe(200);
    expect(payload.totals).toMatchObject({ costBasis: 1000, marketValue: 1200, pnl: 200 });
    expect(isError(res)).toBe(false);
  });

  it('cartera_saldo returns the cash-balance envelope over a live session', async () => {
    const http = new testing.FakeHttpClient((req) => {
      expect(req.params).toMatchObject({
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
    const client = await connect(
      makeRuntime({ http, tokens: new testing.MemoryTokenStore(FRESH_TOKEN) }),
    );
    const res = await client.callTool({
      name: 'cartera_saldo',
      arguments: { fecha: '2026-07-31' },
    });
    const payload = JSON.parse(toolText(res));
    expect(payload).toMatchObject({ currency: 'CLP', fecha: '2026-07-31', total: 125_000 });
    expect(payload.balances[0]).toMatchObject({ bucketId: 900001, amount: 125_000 });
    expect(isError(res)).toBe(false);
  });

  it('instrument_prices returns the price-history envelope over a live session', async () => {
    const http = new testing.FakeHttpClient((req) => {
      expect(req.params).toMatchObject({ idInstrumento: 42 });
      return {
        json: [
          { fecha: '2026-01-01T00:00:00', precio: 100 },
          { fecha: '2026-01-02T00:00:00', precio: 110 },
        ],
      };
    });
    const client = await connect(
      makeRuntime({ http, tokens: new testing.MemoryTokenStore(FRESH_TOKEN) }),
    );
    const res = await client.callTool({ name: 'instrument_prices', arguments: { id: 42 } });
    const payload = JSON.parse(toolText(res));
    expect(payload).toMatchObject({ market: 'local', idInstrumento: 42 });
    expect(payload.stats).toMatchObject({ min: 100, max: 110 });
    expect(isError(res)).toBe(false);
  });

  it('instrument_prices rejects a non-integer id at the zod boundary (.int(), not reaching core)', async () => {
    // The SDK validates the input schema before the handler runs. A real JS float
    // (3.5) must fail the `.int()` check SPECIFICALLY — the error carries
    // received:"float" — distinct from a stringified "3.5", which would fail the
    // number type check (received:"string"). The in-memory transport surfaces the
    // InvalidParams McpError as an isError result rather than a rejection.
    let reached = false;
    const http = new testing.FakeHttpClient(() => {
      reached = true;
      return { json: [] };
    });
    const client = await connect(
      makeRuntime({ http, tokens: new testing.MemoryTokenStore(FRESH_TOKEN) }),
    );
    const res = await client.callTool({ name: 'instrument_prices', arguments: { id: 3.5 } });
    expect(isError(res)).toBe(true);
    expect(toolText(res)).toContain('Expected integer, received float'); // the .int() branch
    expect(reached).toBe(false); // never reached the core task
  });

  it('instruments_international returns the curated envelope over a live session', async () => {
    const http = new testing.FakeHttpClient((req) => {
      expect(req.params).toMatchObject({ search: 'aapl', exchangeName: 'NASDAQ' });
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
    const client = await connect(
      makeRuntime({ http, tokens: new testing.MemoryTokenStore(FRESH_TOKEN) }),
    );
    const res = await client.callTool({
      name: 'instruments_international',
      arguments: { search: 'aapl', exchange: 'NASDAQ' },
    });
    const payload = JSON.parse(toolText(res));
    expect(payload).toMatchObject({ market: 'international', total: 13514 });
    expect(payload.items[0].symbol).toBe('AAPL');
    expect(isError(res)).toBe(false);
  });

  it('instruments_local surfaces the not-authenticated error verbatim (isError)', async () => {
    const client = await connect(makeRuntime());
    const res = await client.callTool({ name: 'instruments_local', arguments: {} });
    expect(isError(res)).toBe(true);
    expect(toolText(res)).toContain('nemo auth login');
  });
});
