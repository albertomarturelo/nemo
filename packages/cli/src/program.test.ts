import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { testing } from '@albertomarturelo/nemo-core';
import { buildProgram } from './program.js';
import { asDomainError, exitCodeFor, isCommanderExit, renderError } from './io.js';
import { captureStdout, fakeInputs, scriptedPrompters } from './test-helpers.js';

const { FakeBrowserLogin, FakeHttpClient, MemoryLoginLatch, MemoryTokenStore, fakeRuntime } =
  testing;

/** A token that never expires (year 2100), so reads don't trigger a refresh. */
const FRESH = (() => {
  const b64 = (s: string): string => Buffer.from(s, 'utf8').toString('base64url');
  return `${b64('{"alg":"none"}')}.${b64(JSON.stringify({ exp: 4_102_444_800 }))}.sig`;
})();

function run(
  runtime: ReturnType<typeof fakeRuntime>,
  argv: string[],
  prompters = scriptedPrompters({}),
  inputs = fakeInputs(),
) {
  return buildProgram(runtime, prompters, inputs).parseAsync(['node', 'nemo', ...argv]);
}

/** Run, expecting a failure; return it rendered as the STDERR JSON main would print. */
async function failure(
  runtime: ReturnType<typeof fakeRuntime>,
  argv: string[],
  inputs = fakeInputs(),
): Promise<{ error: string; type: string; exitCode: number }> {
  const caught: unknown = await run(runtime, argv, scriptedPrompters({}), inputs).then(
    () => {
      throw new Error(`expected \`${argv.join(' ')}\` to fail`);
    },
    (e: unknown) => e,
  );
  return JSON.parse(renderError(asDomainError(caught))) as {
    error: string;
    type: string;
    exitCode: number;
  };
}

describe('nemo CLI', () => {
  let cap: ReturnType<typeof captureStdout>;
  afterEach(() => cap?.restore());

  it('auth status → JSON logged_out when there is no token', async () => {
    const rt = fakeRuntime();
    cap = captureStdout();
    await run(rt, ['auth', 'status']);
    expect(JSON.parse(cap.text())).toEqual({
      authenticated: false,
      state: 'logged_out',
      loginBlocked: [],
    });
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
    expect(JSON.parse(cap.text())).toEqual({
      authenticated: true,
      username: 'me@mail.cl',
      reason: 'signed_in',
    });
    expect(await tokens.get()).toBe('minted');
  });

  describe('unattended login (ADR non-interactive-login)', () => {
    const signIn = (): InstanceType<typeof FakeHttpClient> =>
      new FakeHttpClient((req) => {
        expect(req.body).toEqual({ userName: 'me@mail.cl', password: 'synthetic-pw' });
        return { json: { token: FRESH } };
      });

    it('--password-env signs in, then removes the variable from the environment', async () => {
      const http = signIn();
      const tokens = new MemoryTokenStore();
      const inputs = fakeInputs({ env: { NEMO_PW: 'synthetic-pw', OTHER: 'kept' } });
      cap = captureStdout();
      await run(
        fakeRuntime({ http, tokens }),
        ['auth', 'login', '--user', 'me@mail.cl', '--password-env', 'NEMO_PW'],
        scriptedPrompters({}),
        inputs,
      );
      expect(JSON.parse(cap.text())).toMatchObject({ reason: 'signed_in' });
      expect(cap.text()).not.toContain('synthetic-pw');
      expect(inputs.env).toEqual({ OTHER: 'kept' });
      expect(await tokens.username()).toBe('me@mail.cl');
    });

    it('--password-stdin signs in from one line of stdin', async () => {
      const http = signIn();
      const tokens = new MemoryTokenStore();
      cap = captureStdout();
      await run(
        fakeRuntime({ http, tokens }),
        ['auth', 'login', '--user', 'me@mail.cl', '--password-stdin'],
        scriptedPrompters({}),
        fakeInputs({ stdin: 'synthetic-pw' }),
      );
      expect(JSON.parse(cap.text())).toMatchObject({ reason: 'signed_in' });
      expect(http.calls).toHaveLength(1);
    });

    it('a live session for the same user sends nothing and never reads stdin', async () => {
      const http = new FakeHttpClient();
      const inputs = fakeInputs({ stdin: 'synthetic-pw' });
      cap = captureStdout();
      await run(
        fakeRuntime({ http, tokens: new MemoryTokenStore(FRESH, 'me@mail.cl') }),
        ['auth', 'login', '--user', 'me@mail.cl', '--password-stdin'],
        scriptedPrompters({}),
        inputs,
      );
      expect(JSON.parse(cap.text())).toMatchObject({ reason: 'already_authenticated' });
      expect(http.calls).toHaveLength(0);
      expect(inputs.stdinReads).toBe(0);
    });

    it('a live session for another user is a validation error', async () => {
      const http = new FakeHttpClient();
      const rt = fakeRuntime({ http, tokens: new MemoryTokenStore(FRESH, 'other@mail.cl') });
      const env = { NEMO_PW: 'synthetic-pw' };
      const res = await failure(
        rt,
        ['auth', 'login', '--user', 'me@mail.cl', '--password-env', 'NEMO_PW'],
        fakeInputs({ env }),
      );
      expect(res).toMatchObject({ type: 'validation', exitCode: 1 });
      expect(res.error).toContain('nemo auth logout');
      expect(http.calls).toHaveLength(0);
    });

    it.each([
      [
        'an invalid variable name',
        ['--user', 'me@mail.cl', '--password-env', 'nemo-pw'],
        {},
        'validation',
      ],
      [
        'a missing variable',
        ['--user', 'me@mail.cl', '--password-env', 'NEMO_PW'],
        {},
        'login_failed',
      ],
      [
        'an empty variable',
        ['--user', 'me@mail.cl', '--password-env', 'NEMO_PW'],
        { env: { NEMO_PW: '' } },
        'login_failed',
      ],
      ['empty stdin', ['--user', 'me@mail.cl', '--password-stdin'], { stdin: '' }, 'login_failed'],
      [
        'stdin on a terminal',
        ['--user', 'me@mail.cl', '--password-stdin'],
        { isTTY: true, stdin: 'synthetic-pw' },
        'validation',
      ],
      [
        '--password-env without --user',
        ['--password-env', 'NEMO_PW'],
        { env: { NEMO_PW: 'x' } },
        'validation',
      ],
      ['--password-stdin without --user', ['--password-stdin'], { stdin: 'x' }, 'validation'],
      [
        'two sources',
        ['--user', 'me@mail.cl', '--password-env', 'NEMO_PW', '--password-stdin'],
        { env: { NEMO_PW: 'x' }, stdin: 'x' },
        'validation',
      ],
      ['a source with --browser', ['--browser', '--password-stdin'], { stdin: 'x' }, 'validation'],
    ])('refuses %s, sending nothing', async (_label, args, inputs, type) => {
      const http = new FakeHttpClient(() => ({ json: { token: FRESH } }));
      const browser = new FakeBrowserLogin(FRESH);
      const res = await failure(
        fakeRuntime({ http, browser }),
        ['auth', 'login', ...args],
        fakeInputs(inputs),
      );
      expect(res.type).toBe(type);
      expect(res.error).not.toContain('synthetic-pw');
      expect(http.calls).toHaveLength(0);
      expect(browser.calls).toHaveLength(0);
    });

    it('an error names the variable, never its value', async () => {
      const res = await failure(
        fakeRuntime(),
        ['auth', 'login', '--user', 'me@mail.cl', '--password-env', 'NEMO_PW'],
        fakeInputs({ env: { NEMO_PW: '' } }),
      );
      expect(res.error).toContain('NEMO_PW');
    });
  });

  describe('the rejection latch (ADR non-interactive-login)', () => {
    const entry = { user: 'me@mail.cl', at: '2026-01-01T00:00:00.000Z', status: 401 };

    it('a rejected password is login_rejected (exit 3) and shows in auth status', async () => {
      const latch = new MemoryLoginLatch();
      const http = new FakeHttpClient(() => ({ status: 401, text: 'bad credentials' }));
      const rt = fakeRuntime({ http, latch });
      const res = await failure(
        rt,
        ['auth', 'login', '--user', 'me@mail.cl', '--password-stdin'],
        fakeInputs({ stdin: 'synthetic-pw' }),
      );
      expect(res).toMatchObject({ type: 'login_rejected', exitCode: 3 });
      cap = captureStdout();
      await run(rt, ['auth', 'status']);
      expect(JSON.parse(cap.text())).toMatchObject({
        loginBlocked: [{ user: 'me@mail.cl', status: 401 }],
      });
    });

    it('while latched, --password-env is login_blocked (exit 3) and sends nothing', async () => {
      const http = new FakeHttpClient();
      const rt = fakeRuntime({ http, latch: new MemoryLoginLatch([entry]) });
      const res = await failure(
        rt,
        ['auth', 'login', '--user', 'me@mail.cl', '--password-env', 'NEMO_PW'],
        fakeInputs({ env: { NEMO_PW: 'synthetic-pw' } }),
      );
      expect(res).toMatchObject({ type: 'login_blocked', exitCode: 3 });
      expect(res.error).toContain('nemo auth unblock');
      expect(http.calls).toHaveLength(0);
    });

    it('auth status --human lists the block', async () => {
      cap = captureStdout();
      await run(fakeRuntime({ latch: new MemoryLoginLatch([entry]) }), [
        'auth',
        'status',
        '--human',
      ]);
      expect(cap.text()).toContain('Unattended sign-in blocked for me@mail.cl');
    });

    it('auth unblock refuses without a terminal, and lifts nothing', async () => {
      const latch = new MemoryLoginLatch([entry]);
      const res = await failure(fakeRuntime({ latch }), ['auth', 'unblock'], fakeInputs());
      expect(res).toMatchObject({ type: 'validation', exitCode: 1 });
      expect(latch.entries).toEqual([entry]);
    });

    it('auth unblock in a terminal lifts one user or all', async () => {
      const other = { ...entry, user: 'other@mail.cl' };
      const latch = new MemoryLoginLatch([entry, other]);
      const rt = fakeRuntime({ latch });
      const tty = fakeInputs({ isTTY: true });
      cap = captureStdout();
      await run(rt, ['auth', 'unblock', '--user', 'other@mail.cl'], scriptedPrompters({}), tty);
      expect(JSON.parse(cap.text())).toEqual({ unblocked: ['other@mail.cl'] });
      cap.restore();
      cap = captureStdout();
      await run(rt, ['auth', 'unblock'], scriptedPrompters({}), tty);
      expect(JSON.parse(cap.text())).toEqual({ unblocked: ['me@mail.cl'] });
      expect(latch.entries).toEqual([]);
    });
  });

  describe('commander errors (ADR non-interactive-login)', () => {
    it('an unknown option renders as type validation, exit 1', async () => {
      const res = await failure(fakeRuntime(), ['auth', 'login', '--bogus']);
      expect(res).toMatchObject({ type: 'validation', exitCode: 1 });
      expect(res.error).toContain('--bogus');
    });

    it('--version is a commander exit, not an error', async () => {
      cap = captureStdout();
      const caught: unknown = await run(fakeRuntime(), ['--version']).catch((e: unknown) => e);
      expect(isCommanderExit(caught)).toBe(true);
      expect(cap.text().trim()).toBe(buildProgram(fakeRuntime()).version());
    });
  });

  it('auth login --browser → signs in through the browser seam, never prompts', async () => {
    const browser = new FakeBrowserLogin(FRESH);
    const tokens = new MemoryTokenStore();
    const rt = fakeRuntime({ browser, tokens });
    const noPrompt = (): Promise<string> => Promise.reject(new Error('prompted'));
    cap = captureStdout();
    await run(rt, ['auth', 'login', '--browser'], { line: noPrompt, hidden: noPrompt });
    expect(JSON.parse(cap.text())).toEqual({ authenticated: true, reason: 'signed_in' });
    expect(await tokens.get()).toBe(FRESH);
    expect(browser.calls).toHaveLength(1);
  });

  it('auth login --browser --human → no window over an active session', async () => {
    const browser = new FakeBrowserLogin('unused');
    const rt = fakeRuntime({ browser, tokens: new MemoryTokenStore(FRESH) });
    cap = captureStdout();
    await run(rt, ['auth', 'login', '--browser', '--human']);
    expect(cap.text()).toContain('Already signed in');
    expect(browser.calls).toHaveLength(0);
  });

  it('auth login --browser → an abandoned sign-in is a LoginFailedError (exit 3)', async () => {
    const tokens = new MemoryTokenStore();
    const rt = fakeRuntime({ browser: new FakeBrowserLogin(null), tokens });
    const error: unknown = await run(rt, ['auth', 'login', '--browser']).catch((e: unknown) => e);
    expect(exitCodeFor(error)).toBe(3);
    expect(await tokens.get()).toBeNull();
  });

  it('auth login --browser --user → a validation error before any browser opens', async () => {
    const browser = new FakeBrowserLogin(FRESH);
    const res = await failure(fakeRuntime({ browser }), [
      'auth',
      'login',
      '--browser',
      '--user',
      'me@mail.cl',
    ]);
    expect(res).toMatchObject({ type: 'validation', exitCode: 1 });
    expect(res.error).toMatch(/drop --user/);
    expect(browser.calls).toHaveLength(0);
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

  describe('a failure on STDERR (ADR non-interactive-login)', () => {
    it('renders { error, type, exitCode } in JSON mode', async () => {
      const error: unknown = await run(fakeRuntime(), ['instruments', 'local']).catch(
        (e: unknown) => e,
      );
      expect(JSON.parse(renderError(error))).toEqual({
        error: expect.stringContaining('nemo auth login') as unknown,
        type: 'not_authenticated',
        exitCode: 2,
      });
    });

    it('a portal 429 is rate_limited (exit 1), with the body verbatim', async () => {
      const http = new FakeHttpClient(() => ({ status: 429, text: 'Too Many Requests' }));
      const rt = fakeRuntime({ http, tokens: new MemoryTokenStore(FRESH) });
      const error: unknown = await run(rt, ['instruments', 'local']).catch((e: unknown) => e);
      const rendered = JSON.parse(renderError(error)) as Record<string, unknown>;
      expect(rendered).toMatchObject({ type: 'rate_limited', exitCode: 1 });
      expect(rendered.error).toContain('Too Many Requests');
    });

    it('--human renders the bare message', async () => {
      const error: unknown = await run(fakeRuntime(), ['instruments', 'local', '--human']).catch(
        (e: unknown) => e,
      );
      const rendered = renderError(error);
      expect(rendered).toContain('nemo auth login');
      expect(rendered.startsWith('{')).toBe(false);
    });
  });
});
