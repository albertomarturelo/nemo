import { vi } from 'vitest';
import type { Prompters } from './prompt.js';

/** Capture everything written to STDOUT during a test. */
export function captureStdout(): { text(): string; restore(): void } {
  const chunks: string[] = [];
  const impl = ((chunk: string | Uint8Array): boolean => {
    chunks.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
    return true;
  }) as typeof process.stdout.write;
  const spy = vi.spyOn(process.stdout, 'write').mockImplementation(impl);
  return { text: () => chunks.join(''), restore: () => spy.mockRestore() };
}

/** Scripted prompters: hand back canned answers, in order, no TTY involved. */
export function scriptedPrompters(answers: { line?: string; hidden?: string }): Prompters {
  return {
    line: () => Promise.resolve(answers.line ?? ''),
    hidden: () => Promise.resolve(answers.hidden ?? ''),
  };
}
