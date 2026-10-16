import { describe, expect, it } from 'vitest';
import { BROWSER_LOGIN_TIMEOUT_MS, PROACTIVE_REFRESH_SECONDS } from '../config/index.js';
import { ContractError, LoginFailedError } from '../errors/index.js';
import {
  FakeBrowserLogin,
  FakeHttpClient,
  FixedClock,
  MemoryAuditSink,
  MemoryTokenStore,
  fakeRuntime,
} from '../adapters/fake/index.js';
import { tokenFromSignIn } from '../auth/service.js';
import { authStatus, browserLogin, login, logout } from './auth.js';

function jwtWithExp(expSeconds: number): string {
  const b64 = (s: string): string => Buffer.from(s, 'utf8').toString('base64url');
  return `${b64('{"alg":"none"}')}.${b64(JSON.stringify({ exp: expSeconds }))}.sig`;
}

describe('authStatus', () => {
  const nowMs = 1_000_000_000_000;

  it('reports logged_out with no token', async () => {
    const rt = fakeRuntime({ clock: new FixedClock(nowMs) });
    expect(await authStatus(rt)).toEqual({ authenticated: false, state: 'logged_out' });
  });

  it('reports active for a fresh token', async () => {
    const token = jwtWithExp(nowMs / 1000 + 3600);
    const rt = fakeRuntime({ clock: new FixedClock(nowMs), tokens: new MemoryTokenStore(token) });
    expect(await authStatus(rt)).toEqual({ authenticated: true, state: 'active' });
  });

  it('reports expiring inside the proactive window', async () => {
    const token = jwtWithExp(nowMs / 1000 + PROACTIVE_REFRESH_SECONDS - 5);
    const rt = fakeRuntime({ clock: new FixedClock(nowMs), tokens: new MemoryTokenStore(token) });
    expect(await authStatus(rt)).toEqual({ authenticated: true, state: 'expiring' });
  });

  it('reports expired past exp', async () => {
    const token = jwtWithExp(nowMs / 1000 - 1);
    const rt = fakeRuntime({ clock: new FixedClock(nowMs), tokens: new MemoryTokenStore(token) });
    expect(await authStatus(rt)).toEqual({ authenticated: true, state: 'expired' });
  });
});

describe('logout', () => {
  it('clears a held token and reports it', async () => {
    const tokens = new MemoryTokenStore('abc');
    const rt = fakeRuntime({ tokens });
    expect(await logout(rt)).toEqual({ loggedOut: true });
    expect(await tokens.get()).toBeNull();
  });

  it('is idempotent when already logged out', async () => {
    const rt = fakeRuntime();
    expect(await logout(rt)).toEqual({ loggedOut: false });
  });
});

describe('login', () => {
  it('signs in and caches the token', async () => {
    const http = new FakeHttpClient((req) => {
      expect(req.url).toContain('/publicapi/shared/auth/SignIn');
      expect(req.body).toEqual({ userName: 'me@mail.cl', password: 'secret' });
      return { json: { token: 'minted-token' } };
    });
    const tokens = new MemoryTokenStore();
    const rt = fakeRuntime({ http, tokens });

    const result = await login(rt, { username: 'me@mail.cl', password: 'secret' });
    expect(result).toEqual({ authenticated: true, username: 'me@mail.cl' });
    expect(await tokens.get()).toBe('minted-token');
  });

  it('throws LoginFailedError on a 4xx and never caches', async () => {
    const http = new FakeHttpClient(() => ({ status: 401, text: 'bad credentials' }));
    const tokens = new MemoryTokenStore();
    const rt = fakeRuntime({ http, tokens });

    await expect(login(rt, { username: 'me@mail.cl', password: 'nope' })).rejects.toThrow(
      /SignIn failed/,
    );
    expect(await tokens.get()).toBeNull();
  });
});

describe('browserLogin', () => {
  const nowMs = 1_000_000_000_000;
  const minted = jwtWithExp(nowMs / 1000 + 3600);

  it('opens the browser, caches only the token, and audits without it', async () => {
    const browser = new FakeBrowserLogin(minted);
    const tokens = new MemoryTokenStore();
    const audit = new MemoryAuditSink();
    const rt = fakeRuntime({ browser, tokens, audit, clock: new FixedClock(nowMs) });

    expect(await browserLogin(rt)).toEqual({ authenticated: true, reason: 'signed_in' });
    expect(await tokens.get()).toBe(minted);
    expect(browser.calls).toEqual([{ timeoutMs: BROWSER_LOGIN_TIMEOUT_MS }]);
    expect(audit.entries).toHaveLength(1);
    expect(audit.entries[0]).toMatchObject({
      action: 'auth.login',
      result: 'ok',
      method: 'browser',
    });
    expect(JSON.stringify(audit.entries)).not.toContain(minted);
  });

  it('is idempotent: an active cached token never opens a window', async () => {
    const browser = new FakeBrowserLogin('unused');
    const rt = fakeRuntime({
      browser,
      tokens: new MemoryTokenStore(minted),
      clock: new FixedClock(nowMs),
    });
    expect(await browserLogin(rt)).toEqual({
      authenticated: true,
      reason: 'already_authenticated',
    });
    expect(browser.calls).toHaveLength(0);
  });

  it('signs in again when the cached token is inside the refresh window', async () => {
    const browser = new FakeBrowserLogin(minted);
    const stale = jwtWithExp(nowMs / 1000 + PROACTIVE_REFRESH_SECONDS - 5);
    const tokens = new MemoryTokenStore(stale);
    const rt = fakeRuntime({ browser, tokens, clock: new FixedClock(nowMs) });
    expect(await browserLogin(rt)).toMatchObject({ reason: 'signed_in' });
    expect(await tokens.get()).toBe(minted);
  });

  it('a timeout / closed window caches nothing and is audited as an error', async () => {
    const tokens = new MemoryTokenStore();
    const audit = new MemoryAuditSink();
    const rt = fakeRuntime({ browser: new FakeBrowserLogin(null), tokens, audit });
    await expect(browserLogin(rt)).rejects.toBeInstanceOf(LoginFailedError);
    expect(await tokens.get()).toBeNull();
    expect(audit.entries[0]).toMatchObject({ action: 'auth.login', result: 'error' });
  });

  it('passes contract drift through and caches nothing', async () => {
    const tokens = new MemoryTokenStore();
    const browser = new FakeBrowserLogin(null, new ContractError('no token'));
    const rt = fakeRuntime({ browser, tokens });
    await expect(browserLogin(rt)).rejects.toBeInstanceOf(ContractError);
    expect(await tokens.get()).toBeNull();
  });

  it('fails with a pointer to the CLI when no browser seam is wired', async () => {
    await expect(browserLogin(fakeRuntime())).rejects.toThrow(/nemo auth login/);
  });
});

describe('tokenFromSignIn', () => {
  it('takes only the top-level token from the observed web-login shape', () => {
    const body = { token: 'tkn', user: { nombre: 'Synthetic' }, systemConfig: {} };
    expect(tokenFromSignIn(body)).toBe('tkn');
  });

  it.each([null, 'tkn', {}, { token: '' }, { token: 42 }])('returns null for %j', (body) => {
    expect(tokenFromSignIn(body)).toBeNull();
  });
});
