// A thin wrapper that times a task and writes one audit receipt through the
// `AuditSink` seam. The log is a receipt, never a gatekeeper: a write failure
// degrades silently (the operation already happened). Secret-looking keys are
// dropped by the sink itself, not here.
import type { Runtime } from '../seams/index.js';

/** Run `fn`, then append a receipt `{ ts, action, result, durationMs, ...extra }`.
 *  `ts` is sourced from the `Clock` seam so tests stay deterministic. The task's
 *  return value passes through unchanged; a thrown error is still audited (as
 *  `result: 'error'`) and re-thrown. */
export async function audited<T>(
  rt: Runtime,
  action: string,
  fn: () => Promise<T>,
  extra: Record<string, unknown> = {},
): Promise<T> {
  const startedAt = rt.clock.now();
  try {
    const value = await fn();
    await safeWrite(rt, {
      ts: new Date(rt.clock.now()).toISOString(),
      action,
      result: 'ok',
      durationMs: rt.clock.now() - startedAt,
      ...extra,
    });
    return value;
  } catch (error) {
    await safeWrite(rt, {
      ts: new Date(rt.clock.now()).toISOString(),
      action,
      result: 'error',
      durationMs: rt.clock.now() - startedAt,
      ...extra,
    });
    throw error;
  }
}

async function safeWrite(
  rt: Runtime,
  entry: Parameters<Runtime['audit']['write']>[0],
): Promise<void> {
  try {
    await rt.audit.write(entry);
  } catch {
    // A receipt is best-effort; never let audit failure mask the real result.
  }
}
