// A signature-UNVERIFIED peek at a JWT's `exp` claim, used only to decide whether
// to renew a token proactively (ADR-005). The server remains the authority — the
// reactive 401 path is the real gate. A token we cannot read is treated as "not
// expiring", mirroring nemo-cli: never let a decode hiccup force a needless logout.

/** Decode the `exp` (epoch seconds) from a JWT without verifying its signature.
 *  Returns null when the token is malformed or carries no numeric `exp`. */
export function readExp(token: string): number | null {
  const parts = token.split('.');
  if (parts.length < 2) return null;
  const payloadSegment = parts[1];
  if (!payloadSegment) return null;
  try {
    const json = Buffer.from(base64UrlToBase64(payloadSegment), 'base64').toString('utf8');
    const claims: unknown = JSON.parse(json);
    if (typeof claims !== 'object' || claims === null) return null;
    const exp = (claims as Record<string, unknown>).exp;
    return typeof exp === 'number' ? exp : null;
  } catch {
    return null;
  }
}

/** True when the token expires within `seconds` from `nowMs`. An unreadable token
 *  returns false (treat as still valid; let the server reject it if it isn't). */
export function isExpiringWithin(token: string, seconds: number, nowMs: number): boolean {
  const exp = readExp(token);
  if (exp === null) return false;
  return exp * 1000 <= nowMs + seconds * 1000;
}

function base64UrlToBase64(segment: string): string {
  const padded = segment.padEnd(Math.ceil(segment.length / 4) * 4, '=');
  return padded.replace(/-/g, '+').replace(/_/g, '/');
}
