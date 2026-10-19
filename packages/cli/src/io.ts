// Output + error→exit-code mapping for the CLI. The broker's messages pass through
// unchanged (CONVENTIONS: opaque translations waste the user's time).
import type { Command } from 'commander';
import {
  classifyError,
  LoginFailedError,
  NotAuthenticatedError,
} from '@albertomarturelo/nemo-core';

// JSON is the DEFAULT output: the CLI is a faithful façade over the @albertomarturelo/nemo-core
// library contract (tasks return plain, JSON-serializable objects), so driving it via
// Bash yields structured data, not text. `--human` switches to the readable rendering.
type OutputMode = 'json' | 'human';
let outputMode: OutputMode = 'json';

export function setOutputMode(mode: OutputMode): void {
  outputMode = mode;
}
export function isHumanMode(): boolean {
  return outputMode === 'human';
}

/** STDOUT line — a human-render building block (and what `emit` writes the JSON with). */
export function out(line: string): void {
  process.stdout.write(`${line}\n`);
}

/** Diagnostics go to STDERR, so STDOUT stays clean for `| jq`. */
export function err(line: string): void {
  process.stderr.write(`${line}\n`);
}

/** Emit a command result. Default = the task's object as pretty JSON (the integration
 *  contract); `--human` runs the human renderer instead. */
export function emit(data: unknown, human: () => void): void {
  if (outputMode === 'human') human();
  else out(JSON.stringify(data, null, 2));
}

/** The two global output flags. Added to the root AND every leaf command so they parse
 *  in any position (`nemo --human instruments local` and `nemo instruments local --human`). */
export function withOutputFlags(cmd: Command): Command {
  return cmd
    .option('--json', 'Output as JSON (the default).')
    .option('--human', 'Human-readable output instead of JSON.');
}

/** Exit-code contract (see @albertomarturelo/nemo-core errors): NotAuthenticated → 2 (incl.
 *  SessionExpired), LoginFailed → 3, anything else → 1. */
export function exitCodeFor(error: unknown): number {
  if (error instanceof NotAuthenticatedError) return 2;
  if (error instanceof LoginFailedError) return 3;
  return 1;
}

/** The STDERR line for a failure. `--human` gets the bare message; JSON mode (the
 *  default) gets `{ error, type, exitCode }`, so an unattended caller decides by the
 *  stable `type`, never by the text (ADR `non-interactive-login`). */
export function renderError(error: unknown): string {
  const { type, message } = classifyError(error);
  if (isHumanMode()) return message;
  return JSON.stringify({ error: message, type, exitCode: exitCodeFor(error) });
}
