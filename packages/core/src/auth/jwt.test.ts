import { describe, expect, it } from 'vitest';
import { isExpiringWithin, readExp } from './jwt.js';

/** Build an unsigned-but-well-formed JWT carrying a given `exp` (epoch seconds). */
function jwtWithExp(exp: number): string {
  const header = base64url(JSON.stringify({ alg: 'none', typ: 'JWT' }));
  const payload = base64url(JSON.stringify({ exp }));
  return `${header}.${payload}.sig`;
}

function base64url(text: string): string {
  return Buffer.from(text, 'utf8').toString('base64url');
}

describe('readExp', () => {
  it('reads a numeric exp claim', () => {
    expect(readExp(jwtWithExp(1_800_000_000))).toBe(1_800_000_000);
  });

  it('returns null for a malformed token', () => {
    expect(readExp('not-a-jwt')).toBeNull();
    expect(readExp('')).toBeNull();
  });

  it('returns null when there is no exp', () => {
    const token = `${base64url('{}')}.${base64url('{}')}.sig`;
    expect(readExp(token)).toBeNull();
  });
});

describe('isExpiringWithin', () => {
  const now = 1_000_000_000_000; // epoch ms

  it('is false for a token comfortably in the future', () => {
    const token = jwtWithExp(now / 1000 + 3600);
    expect(isExpiringWithin(token, 60, now)).toBe(false);
  });

  it('is true within the window', () => {
    const token = jwtWithExp(now / 1000 + 30);
    expect(isExpiringWithin(token, 60, now)).toBe(true);
  });

  it('is true for an already-expired token', () => {
    const token = jwtWithExp(now / 1000 - 10);
    expect(isExpiringWithin(token, 0, now)).toBe(true);
  });

  it('treats an unreadable token as not expiring (server is the authority)', () => {
    expect(isExpiringWithin('garbage', 60, now)).toBe(false);
  });
});
