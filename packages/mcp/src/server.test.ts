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
    expect(names).toEqual(['auth_logout', 'auth_status', 'cartera_movements', 'instruments_local']);

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

  it('instruments_local surfaces the not-authenticated error verbatim (isError)', async () => {
    const client = await connect(makeRuntime());
    const res = await client.callTool({ name: 'instruments_local', arguments: {} });
    expect(isError(res)).toBe(true);
    expect(toolText(res)).toContain('nemo auth login');
  });
});
