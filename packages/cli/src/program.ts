// The `nemo` command tree (commander, ADR-008). Every action is a thin call into a
// @albertomarturelo/nemo-core task — the CLI never reaches past the task layer (ADR-003). The
// Runtime is injected so tests drive the whole tree against fakes (no network).
import { Command } from 'commander';
import type { Runtime } from '@albertomarturelo/nemo-core';
import { setOutputMode, withOutputFlags } from './io.js';
import { nodePrompters, type Prompters } from './prompt.js';
// Surfaces register their subtree from ONE append-only line each (ADR-007).
import { registerAuth } from './commands/auth.js';
import { registerInstruments } from './commands/instruments.js';
import { registerCartera } from './commands/cartera.js';

export function buildProgram(runtime: Runtime, prompters: Prompters = nodePrompters): Command {
  const program = new Command();
  program
    .name('nemo')
    .description('CLI for the Vector Capital broker portal (Chile).')
    .version('0.3.0');
  // Output is JSON by default (the @albertomarturelo/nemo-core data contract); `--human` for text.
  withOutputFlags(program);

  program.hook('preAction', (_thisCommand, actionCommand) => {
    setOutputMode(actionCommand.optsWithGlobals().human ? 'human' : 'json');
  });

  registerAuth(program, runtime, prompters);
  registerInstruments(program, runtime);
  registerCartera(program, runtime);

  // Make `--json`/`--human` parse after a subcommand too, by adding them to every
  // leaf command once the register fns have built their subtrees.
  addOutputFlagsToLeaves(program);
  return program;
}

function addOutputFlagsToLeaves(cmd: Command): void {
  if (cmd.commands.length === 0) {
    withOutputFlags(cmd);
    return;
  }
  for (const sub of cmd.commands) addOutputFlagsToLeaves(sub);
}
