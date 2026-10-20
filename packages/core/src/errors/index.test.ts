import { describe, expect, it } from 'vitest';
import {
  ApiError,
  classifyError,
  ContractError,
  LoginBlockedError,
  LoginFailedError,
  LoginRejectedError,
  NotAuthenticatedError,
  SessionExpiredError,
  ValidationError,
} from './index.js';

describe('classifyError', () => {
  it.each([
    [new SessionExpiredError(), 'session_expired'],
    [new NotAuthenticatedError('no session'), 'not_authenticated'],
    [new LoginRejectedError(401, 'rejected'), 'login_rejected'],
    [new LoginBlockedError(401, '2026-01-01T00:00:00.000Z', 'blocked'), 'login_blocked'],
    [new LoginFailedError('failed'), 'login_failed'],
    [new ApiError(429, 'too many requests'), 'rate_limited'],
    [new ApiError(500, 'boom'), 'api_error'],
    [new ContractError('drifted'), 'contract'],
    [new ValidationError('bad flag'), 'validation'],
    [new Error('a bug'), 'unexpected'],
    ['a thrown string', 'unexpected'],
  ])('%s → %s', (error, type) => {
    expect(classifyError(error).type).toBe(type);
  });

  it('checks a subtype before its parent (SessionExpired is a NotAuthenticated)', () => {
    const error = new SessionExpiredError();
    expect(error).toBeInstanceOf(NotAuthenticatedError);
    expect(classifyError(error).type).toBe('session_expired');
  });

  it('passes the message through verbatim', () => {
    expect(classifyError(new ApiError(400, 'Cuenta no encontrada')).message).toBe(
      'Cuenta no encontrada',
    );
    expect(classifyError('a thrown string').message).toBe('a thrown string');
  });
});
