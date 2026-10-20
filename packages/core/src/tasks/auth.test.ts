import { describe, expect, it } from 'vitest';
import { BROWSER_LOGIN_TIMEOUT_MS, PROACTIVE_REFRESH_SECONDS } from '../config/index.js';
import {
  ApiError,
  ContractError,
  LoginBlockedError,
  LoginFailedError,
  LoginRejectedError,
  ValidationError,
} from '../errors/index.js';
import {
  FakeBrowserLogin,
  FakeHttpClient,
  FixedClock,
  MemoryAuditSink,
  MemoryLoginLatch,
  MemoryTokenStore,
  fakeRuntime,
} from '../adapters/fake/index.js';
import { tokenFromSignIn } from '../auth/service.js';
import { authStatus, browserLogin, login, logout, unblock } from './auth.js';

function jwtWithExp(expSeconds: number): string {
  const b64 = (s: string): string => Buffer.from(s, 'utf8').toString('base64url');
  return `${b64('{"alg":"none"}')}.${b64(JSON.stringify({ exp: expSeconds }))}.sig`;
}

describe('authStatus', () => {
  const nowMs = 1_000_000_000_000;

  it('reports logged_out with no token', async () => {
    const rt = fakeRuntime({ clock: new FixedClock(nowMs) });
    expect(await authStatus(rt)).toEqual({
      authenticated: false,
      state: 'logged_out',
      loginBlocked: [],
    });
  });

  it('reports active for a fresh token', async () => {
    const token = jwtWithExp(nowMs / 1000 + 3600);
    const rt = fakeRuntime({ clock: new FixedClock(nowMs), tokens: new MemoryTokenStore(token) });
    expect(await authStatus(rt)).toEqual({
      authenticated: true,
      state: 'active',
      loginBlocked: [],
    });
  });

  it('reports expiring inside the proactive window', async () => {
    const token = jwtWithExp(nowMs / 1000 + PROACTIVE_REFRESH_SECONDS - 5);
    const rt = fakeRuntime({ clock: new FixedClock(nowMs), tokens: new MemoryTokenStore(token) });
    expect(await authStatus(rt)).toEqual({
      authenticated: true,
      state: 'expiring',
      loginBlocked: [],
    });
  });

  it('reports expired past exp', async () => {
    const token = jwtWithExp(nowMs / 1000 - 1);
    const rt = fakeRuntime({ clock: new FixedClock(nowMs), tokens: new MemoryTokenStore(token) });
    expect(await authStatus(rt)).toEqual({
      authenticated: true,
      state: 'expired',
      loginBlocked: [],
    });
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
  const nowMs = 1_000_000_000_000;
  const live = jwtWithExp(nowMs / 1000 + 3600);
  const stale = jwtWithExp(nowMs / 1000 + PROACTIVE_REFRESH_SECONDS - 5);
  const password =
    (value = 'secret') =>
    () =>
      Promise.resolve(value);
  const neverAsked = (): Promise<string> => Promise.reject(new Error('password was read'));

  it('signs in, caches the token with its owner, and audits the source', async () => {
    const http = new FakeHttpClient((req) => {
      expect(req.url).toContain('/publicapi/shared/auth/SignIn');
      expect(req.body).toEqual({ userName: 'me@mail.cl', password: 'secret' });
      return { json: { token: 'minted-token' } };
    });
    const tokens = new MemoryTokenStore();
    const audit = new MemoryAuditSink();
    const rt = fakeRuntime({ http, tokens, audit });

    const result = await login(rt, {
      username: 'me@mail.cl',
      source: 'env',
      password: password(),
    });
    expect(result).toEqual({ authenticated: true, username: 'me@mail.cl', reason: 'signed_in' });
    expect(await tokens.get()).toBe('minted-token');
    expect(await tokens.username()).toBe('me@mail.cl');
    expect(audit.entries[0]).toMatchObject({ action: 'auth.login', result: 'ok', source: 'env' });
    expect(JSON.stringify(audit.entries)).not.toContain('secret');
  });

  it('throws LoginFailedError on a 4xx and never caches', async () => {
    const http = new FakeHttpClient(() => ({ status: 401, text: 'bad credentials' }));
    const tokens = new MemoryTokenStore();
    const rt = fakeRuntime({ http, tokens });

    await expect(
      login(rt, { username: 'me@mail.cl', source: 'prompt', password: password('nope') }),
    ).rejects.toThrow(/SignIn failed/);
    expect(await tokens.get()).toBeNull();
  });

  it('a live token for the same user answers already_authenticated with no call', async () => {
    const http = new FakeHttpClient();
    const audit = new MemoryAuditSink();
    const rt = fakeRuntime({
      http,
      audit,
      clock: new FixedClock(nowMs),
      tokens: new MemoryTokenStore(live, 'me@mail.cl'),
    });

    const result = await login(rt, {
      username: ' Me@Mail.cl ',
      source: 'stdin',
      password: neverAsked,
    });
    expect(result).toEqual({
      authenticated: true,
      username: 'Me@Mail.cl',
      reason: 'already_authenticated',
    });
    expect(http.calls).toHaveLength(0);
    expect(audit.entries).toHaveLength(0);
  });

  it.each([
    ['another account', 'other@mail.cl', /another account/],
    ['an unrecorded account', null, /not recorded/],
  ])('a live token for %s is refused with no call', async (_label, owner, message) => {
    const http = new FakeHttpClient();
    const tokens = new MemoryTokenStore(live, owner);
    const rt = fakeRuntime({ http, tokens, clock: new FixedClock(nowMs) });

    const error: unknown = await login(rt, {
      username: 'me@mail.cl',
      source: 'env',
      password: neverAsked,
    }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ValidationError);
    expect((error as Error).message).toMatch(message);
    expect(http.calls).toHaveLength(0);
    expect(await tokens.get()).toBe(live);
  });

  it('signs in again over a token inside the refresh window, even for another user', async () => {
    const http = new FakeHttpClient(() => ({ json: { token: 'minted-token' } }));
    const tokens = new MemoryTokenStore(stale, 'other@mail.cl');
    const rt = fakeRuntime({ http, tokens, clock: new FixedClock(nowMs) });

    const result = await login(rt, {
      username: 'me@mail.cl',
      source: 'prompt',
      password: password(),
    });
    expect(result.reason).toBe('signed_in');
    expect(await tokens.username()).toBe('me@mail.cl');
  });

  it('refuses an empty password or email before any call', async () => {
    const http = new FakeHttpClient();
    const rt = fakeRuntime({ http });
    await expect(
      login(rt, { username: 'me@mail.cl', source: 'prompt', password: password('') }),
    ).rejects.toThrow(LoginFailedError);
    await expect(
      login(rt, { username: '  ', source: 'prompt', password: password() }),
    ).rejects.toThrow(ValidationError);
    expect(http.calls).toHaveLength(0);
  });
});

describe('the rejection latch (ADR non-interactive-login)', () => {
  const nowMs = 1_000_000_000_000;
  const at = new Date(nowMs).toISOString();
  const live = jwtWithExp(nowMs / 1000 + 3600);
  const password = () => Promise.resolve('synthetic-pw');
  const neverAsked = (): Promise<string> => Promise.reject(new Error('password was read'));
  const blockedEntry = { user: 'me@mail.cl', at: '2026-01-01T00:00:00.000Z', status: 401 };

  it.each(['prompt', 'env', 'stdin'] as const)(
    'a 401 from SignIn (%s) is login_rejected and trips the latch',
    async (source) => {
      const http = new FakeHttpClient(() => ({ status: 401, text: 'bad credentials' }));
      const latch = new MemoryLoginLatch();
      const rt = fakeRuntime({ http, latch, clock: new FixedClock(nowMs) });

      const error: unknown = await login(rt, { username: 'Me@Mail.cl', source, password }).catch(
        (e: unknown) => e,
      );
      expect(error).toBeInstanceOf(LoginRejectedError);
      expect(latch.entries).toEqual([{ user: 'me@mail.cl', at, status: 401 }]);
    },
  );

  it.each([
    ['a 5xx', () => ({ status: 503, text: 'down' }), LoginFailedError],
    ['a 429', () => ({ status: 429, text: 'slow down' }), ApiError],
  ])('%s never trips it (Vector did not judge the password)', async (_l, reply, kind) => {
    const latch = new MemoryLoginLatch();
    const rt = fakeRuntime({ http: new FakeHttpClient(reply), latch });
    const error: unknown = await login(rt, {
      username: 'me@mail.cl',
      source: 'env',
      password,
    }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(kind);
    expect(error).not.toBeInstanceOf(LoginRejectedError);
    expect(latch.entries).toEqual([]);
  });

  it('a network error never trips it', async () => {
    const latch = new MemoryLoginLatch();
    const http = new FakeHttpClient(() => Promise.reject(new Error('ECONNRESET')));
    const rt = fakeRuntime({ http, latch });
    await expect(login(rt, { username: 'me@mail.cl', source: 'stdin', password })).rejects.toThrow(
      'ECONNRESET',
    );
    expect(latch.entries).toEqual([]);
  });

  it.each(['env', 'stdin'] as const)(
    'while latched, a %s sign-in is login_blocked with zero calls',
    async (source) => {
      const http = new FakeHttpClient();
      const audit = new MemoryAuditSink();
      const latch = new MemoryLoginLatch([blockedEntry]);
      const rt = fakeRuntime({ http, audit, latch });

      const error: unknown = await login(rt, {
        username: 'ME@mail.cl',
        source,
        password: neverAsked,
      }).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(LoginBlockedError);
      expect(error).toMatchObject({ status: 401, at: blockedEntry.at });
      expect(http.calls).toHaveLength(0);
      expect(audit.entries).toMatchObject([{ action: 'auth.login', result: 'blocked', source }]);
      expect(latch.entries).toEqual([blockedEntry]);
    },
  );

  it('a latched user with a live token still gets already_authenticated', async () => {
    const http = new FakeHttpClient();
    const rt = fakeRuntime({
      http,
      clock: new FixedClock(nowMs),
      tokens: new MemoryTokenStore(live, 'me@mail.cl'),
      latch: new MemoryLoginLatch([blockedEntry]),
    });
    const result = await login(rt, { username: 'me@mail.cl', source: 'env', password: neverAsked });
    expect(result.reason).toBe('already_authenticated');
    expect(http.calls).toHaveLength(0);
  });

  it('a successful prompt sign-in clears that user only', async () => {
    const other = { user: 'other@mail.cl', at: blockedEntry.at, status: 400 };
    const latch = new MemoryLoginLatch([blockedEntry, other]);
    const http = new FakeHttpClient(() => ({ json: { token: 'minted' } }));
    const rt = fakeRuntime({ http, latch });

    await login(rt, { username: 'Me@Mail.cl', source: 'prompt', password });
    expect(latch.entries).toEqual([other]);
  });

  it('an unattended success leaves other users latched', async () => {
    const other = { user: 'other@mail.cl', at: blockedEntry.at, status: 400 };
    const latch = new MemoryLoginLatch([other]);
    const http = new FakeHttpClient(() => ({ json: { token: 'minted' } }));
    await login(fakeRuntime({ http, latch }), { username: 'me@mail.cl', source: 'env', password });
    expect(latch.entries).toEqual([other]);
  });

  it('a browser sign-in never clears it: nemo cannot tell whose account it was', async () => {
    const latch = new MemoryLoginLatch([blockedEntry]);
    const rt = fakeRuntime({ browser: new FakeBrowserLogin(live), latch });
    await browserLogin(rt);
    expect(latch.entries).toEqual([blockedEntry]);
  });

  it('authStatus reports the latch, logged in or not', async () => {
    const rt = fakeRuntime({ latch: new MemoryLoginLatch([blockedEntry]) });
    expect(await authStatus(rt)).toEqual({
      authenticated: false,
      state: 'logged_out',
      loginBlocked: [blockedEntry],
    });
  });

  it('unblock lifts one user or all, and audits it', async () => {
    const other = { user: 'other@mail.cl', at: blockedEntry.at, status: 400 };
    const latch = new MemoryLoginLatch([blockedEntry, other]);
    const audit = new MemoryAuditSink();
    const rt = fakeRuntime({ latch, audit });

    expect(await unblock(rt, { user: ' OTHER@mail.cl' })).toEqual({ unblocked: ['other@mail.cl'] });
    expect(latch.entries).toEqual([blockedEntry]);
    expect(await unblock(rt)).toEqual({ unblocked: ['me@mail.cl'] });
    expect(await unblock(rt)).toEqual({ unblocked: [] });
    expect(audit.entries.map((e) => e.action)).toEqual([
      'auth.unblock',
      'auth.unblock',
      'auth.unblock',
    ]);
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
      source: 'browser',
    });
    expect(await tokens.username()).toBeNull(); // the email was typed on Vector's page
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
