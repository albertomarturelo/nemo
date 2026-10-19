// The state-directory rules of the Node defaults. `resolveNemoDir` gets an injected
// env (one test stubs NEMO_HOME and restores it); the file adapters write only under
// a throwaway temp dir, never the real home directory (CONVENTIONS, Testing).
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ValidationError } from '../../errors/index.js';
import { FileAuditSink, FileTokenStore, NEMO_DIR, resolveNemoDir } from './index.js';

describe('resolveNemoDir', () => {
  it('defaults to ~/.nemo when NEMO_HOME is unset or empty', () => {
    expect(resolveNemoDir({})).toBe(NEMO_DIR);
    expect(resolveNemoDir({ NEMO_HOME: '' })).toBe(NEMO_DIR);
  });

  it('uses an absolute NEMO_HOME as is', () => {
    expect(resolveNemoDir({ NEMO_HOME: '/workspace/.nemo' })).toBe('/workspace/.nemo');
  });

  it.each(['workspace/.nemo', './.nemo', '~/.nemo'])('refuses the relative path %s', (dir) => {
    expect(() => resolveNemoDir({ NEMO_HOME: dir })).toThrow(ValidationError);
  });
});

describe('file adapters in a given state directory', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'nemo-home-'));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('FileTokenStore keeps token.json there, with its owner, owner-only', async () => {
    const store = new FileTokenStore(dir);
    await store.set('synthetic-token', 'me@mail.cl');
    const file = join(dir, 'token.json');
    expect(JSON.parse(await readFile(file, 'utf8'))).toEqual({
      token: 'synthetic-token',
      username: 'me@mail.cl',
    });
    expect((await stat(file)).mode & 0o777).toBe(0o600);
    expect(await store.get()).toBe('synthetic-token');
    expect(await store.username()).toBe('me@mail.cl');
    await store.clear();
    expect(await store.get()).toBeNull();
    expect(await store.username()).toBeNull();
  });

  it('FileTokenStore writes no username for an unknown owner, and tightens an old file', async () => {
    const file = join(dir, 'token.json');
    await writeFile(file, JSON.stringify({ token: 'old-token' }), { mode: 0o644 });
    const store = new FileTokenStore(dir);
    expect(await store.username()).toBeNull(); // cached before owners were recorded
    await store.set('synthetic-token', null);
    expect(JSON.parse(await readFile(file, 'utf8'))).toEqual({ token: 'synthetic-token' });
    expect((await stat(file)).mode & 0o777).toBe(0o600);
  });

  it('a store built with no directory follows NEMO_HOME too', async () => {
    vi.stubEnv('NEMO_HOME', dir);
    try {
      await new FileTokenStore().set('synthetic-token', null);
    } finally {
      vi.unstubAllEnvs();
    }
    expect(await new FileTokenStore(dir).get()).toBe('synthetic-token');
  });

  it('FileAuditSink appends audit.log there, without secret-looking keys', async () => {
    await new FileAuditSink(dir).write({
      ts: '2026-01-01T00:00:00.000Z',
      action: 'auth.login',
      result: 'ok',
      password: 'never-written',
    });
    const line = JSON.parse((await readFile(join(dir, 'audit.log'), 'utf8')).trim());
    expect(line).toEqual({ ts: '2026-01-01T00:00:00.000Z', action: 'auth.login', result: 'ok' });
  });
});
