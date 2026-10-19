// `nemo auth …` — session lifecycle. Each action is a thin call into a @albertomarturelo/nemo-core
// task (ADR-003). `login` takes a password, so it is imported from the CLI-only
// `@albertomarturelo/nemo-core/cli` subpath — the MCP server never touches it (ADR-006).
// `--browser` uses the credential-free `browserLogin` instead (ADR `mcp-browser-login`).
// The password comes from exactly one source the command line names: the hidden
// prompt (default), `--password-env <VAR>` or `--password-stdin`, the last two for
// unattended use (ADR `non-interactive-login`). No source falls back to another.
import type { Command } from 'commander';
import {
  authStatus,
  browserLogin,
  logout,
  LoginFailedError,
  ValidationError,
  type Runtime,
} from '@albertomarturelo/nemo-core';
import { login, type LoginSource } from '@albertomarturelo/nemo-core/cli';
import { emit, out } from '../io.js';
import type { ProcessInputs, Prompters } from '../prompt.js';

interface LoginOptions {
  user?: string;
  browser?: boolean;
  passwordEnv?: string;
  passwordStdin?: boolean;
}

// An env var name, so a typo'd or injected value can't name something stranger.
const ENV_NAME = /^[A-Z_][A-Z0-9_]*$/;

export function registerAuth(
  program: Command,
  runtime: Runtime,
  prompters: Prompters,
  inputs: ProcessInputs,
): void {
  const auth = program.command('auth').description('Authentication and session.');

  auth
    .command('login')
    .description('Sign in with your Vector Capital credentials and cache the bearer token.')
    .option('--user <email>', 'Account email (prompted if omitted).')
    .option(
      '--browser',
      "Sign in on Vector's own page in a browser window instead of the prompt; the password never enters nemo.",
    )
    .option(
      '--password-env <VAR>',
      'Unattended: read the password from the environment variable VAR, which is then removed from the environment. Needs --user.',
    )
    .option(
      '--password-stdin',
      'Unattended: read the password from the first line of stdin (a pipe or a file, never a terminal). Needs --user.',
    )
    .action(async (opts: LoginOptions) => {
      const chosen = [
        opts.browser ? '--browser' : null,
        opts.passwordEnv !== undefined ? '--password-env' : null,
        opts.passwordStdin ? '--password-stdin' : null,
      ].filter((flag) => flag !== null);
      if (chosen.length > 1) {
        throw new ValidationError(`Pick one sign-in source: ${chosen.join(' and ')} conflict.`);
      }

      if (opts.browser) {
        // The email is typed into Vector's page too, so a --user value would be ignored.
        if (opts.user !== undefined) {
          throw new ValidationError(
            "--browser signs in on Vector's page, where you type the email — drop --user.",
          );
        }
        const result = await browserLogin(runtime);
        emit(result, () =>
          out(
            result.reason === 'already_authenticated'
              ? 'Already signed in — the session is active.'
              : 'Signed in (browser).',
          ),
        );
        return;
      }
      const unattended = opts.passwordEnv !== undefined || opts.passwordStdin === true;
      // There is no prompt to ask for the email when nobody is at the keyboard.
      if (unattended && !opts.user?.trim()) {
        const flag = opts.passwordEnv !== undefined ? '--password-env' : '--password-stdin';
        throw new ValidationError(`${flag} needs --user <email>: nothing is prompted.`);
      }

      // Every source is resolved — and checked — before anything is sent, but the
      // password itself is read only if `login` finds no live session.
      let source: LoginSource = 'prompt';
      let password = (): Promise<string> => prompters.hidden('Password: ');
      if (opts.passwordEnv !== undefined) {
        source = 'env';
        password = envPassword(inputs.env, opts.passwordEnv);
      } else if (opts.passwordStdin) {
        source = 'stdin';
        password = stdinPassword(inputs.stdin);
      }

      const username = opts.user ?? (await prompters.line('Email: '));
      const result = await login(runtime, { username, source, password });
      emit(result, () =>
        out(
          result.reason === 'already_authenticated'
            ? `Already signed in as ${result.username} — the session is active.`
            : `Signed in as ${result.username}.`,
        ),
      );
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

/** `--password-env <VAR>`: take the value out of the environment NOW, so nothing this
 *  process starts can inherit it, and hand it over only when `login` asks. Errors
 *  name the variable, never its value. */
function envPassword(env: ProcessInputs['env'], name: string): () => Promise<string> {
  if (!ENV_NAME.test(name)) {
    throw new ValidationError(
      `--password-env takes an environment variable name (A-Z, 0-9, _), got "${name}".`,
    );
  }
  const value = env[name];
  delete env[name];
  return () => {
    if (!value) {
      return Promise.reject(
        new LoginFailedError(
          `Environment variable ${name} is unset or empty — no sign-in attempted.`,
        ),
      );
    }
    return Promise.resolve(value);
  };
}

/** `--password-stdin`: one line from a pipe or a file. A terminal is refused: there the
 *  hidden prompt is the right tool, and a visible read would echo the password. */
function stdinPassword(stdin: ProcessInputs['stdin']): () => Promise<string> {
  if (stdin.isTTY) {
    throw new ValidationError(
      '--password-stdin reads a pipe or a file, not a terminal — drop it to be prompted.',
    );
  }
  return async () => {
    const value = await stdin.readLine();
    if (!value) throw new LoginFailedError('No password on stdin — no sign-in attempted.');
    return value;
  };
}
