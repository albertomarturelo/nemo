import { describe, expect, it } from 'vitest';
import { PROACTIVE_REFRESH_SECONDS } from '../config/index.js';
import {
  FakeHttpClient,
  FixedClock,
  MemoryTokenStore,
  fakeRuntime,
} from '../adapters/fake/index.js';
import { authStatus, login, logout } from './auth.js';

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
