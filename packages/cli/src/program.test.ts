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
});
