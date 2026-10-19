#!/usr/bin/env node
// @albertomarturelo/nemo-cli — entry point. Thin surface over @albertomarturelo/nemo-core tasks (ADR-003): build
// the command tree against the Node runtime and parse argv. Domain errors map to the
// documented exit codes; their messages pass through unchanged.
import { PlaywrightBrowserLogin, createNodeRuntime } from '@albertomarturelo/nemo-core/node';
import { buildProgram } from './program.js';
import { err, exitCodeFor, renderError, setOutputMode } from './io.js';

async function main(): Promise<void> {
  // The runtime is built before argv is parsed, so a failure there (a bad NEMO_HOME)
  // would otherwise ignore `--human`.
  if (process.argv.includes('--human')) setOutputMode('human');
  // The browser seam backs `auth login --browser` only; `playwright` loads lazily, so
  // no other command pays for it.
  const runtime = createNodeRuntime({ browser: new PlaywrightBrowserLogin() });
  await buildProgram(runtime).parseAsync(process.argv);
}

main().catch((error: unknown) => {
  // Errors go to STDERR (STDOUT stays clean for piping), as JSON by default.
  err(renderError(error));
  process.exitCode = exitCodeFor(error);
});
