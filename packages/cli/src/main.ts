#!/usr/bin/env node
// @albertomarturelo/nemo-cli — entry point. Thin surface over @albertomarturelo/nemo-core tasks (ADR-003): build
// the command tree against the Node runtime and parse argv. Domain errors map to the
// documented exit codes; their messages pass through unchanged.
import { PlaywrightBrowserLogin, createNodeRuntime } from '@albertomarturelo/nemo-core/node';
import { buildProgram } from './program.js';
import { err, exitCodeFor, isHumanMode, messageOf } from './io.js';

async function main(): Promise<void> {
  // The browser seam backs `auth login --browser` only; `playwright` loads lazily, so
  // no other command pays for it.
  const runtime = createNodeRuntime({ browser: new PlaywrightBrowserLogin() });
  await buildProgram(runtime).parseAsync(process.argv);
}

main().catch((error: unknown) => {
  const message = messageOf(error);
  // Errors go to STDERR (STDOUT stays clean for piping). JSON mode (the default)
  // wraps the message in `{ error }` so a consumer can parse failures too.
  err(isHumanMode() ? message : JSON.stringify({ error: message }));
  process.exitCode = exitCodeFor(error);
});
