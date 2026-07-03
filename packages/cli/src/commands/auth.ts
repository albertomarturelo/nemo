// `nemo auth …` — session lifecycle. Each action is a thin call into a @albertomarturelo/nemo-core
// task (ADR-003). `login` takes a password, so it is imported from the CLI-only
// `@albertomarturelo/nemo-core/cli` subpath — the MCP server never touches it (ADR-006).
import type { Command } from 'commander';
import { authStatus, logout, LoginFailedError, type Runtime } from '@albertomarturelo/nemo-core';
import { login } from '@albertomarturelo/nemo-core/cli';
import { emit, out } from '../io.js';
import type { Prompters } from '../prompt.js';

export function registerAuth(program: Command, runtime: Runtime, prompters: Prompters): void {
  const auth = program.command('auth').description('Authentication and session.');

  auth
    .command('login')
    .description('Sign in with your Vector Capital credentials and cache the bearer token.')
    .option('--user <email>', 'Account email (prompted if omitted).')
    .action(async (opts: { user?: string }) => {
      // The email may come from a flag; the PASSWORD is always a hidden prompt —
      // never a flag/arg/env (ADR-006).
      const username = opts.user ?? (await prompters.line('Email: '));
      const password = await prompters.hidden('Password: ');
      if (!password) throw new LoginFailedError('Empty password — no sign-in attempted.');
      const result = await login(runtime, { username, password });
      emit(result, () => out(`Signed in as ${result.username}.`));
    });

  auth
    .command('status')
    .description('Show the current session state (local read; never touches the network).')
    .action(async () => {
      const status = await authStatus(runtime);
      emit(status, () => {
        out(
          status.authenticated
            ? `Authenticated (${status.state}).`
            : 'Not authenticated. Run `nemo auth login`.',
        );
      });
    });

  auth
    .command('logout')
    .description('Drop the cached bearer token.')
    .action(async () => {
      const result = await logout(runtime);
      emit(result, () => out(result.loggedOut ? 'Logged out.' : 'No active session.'));
    });
}
