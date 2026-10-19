// Terminal prompters and the process inputs, injectable so tests drive the login
// flow without a TTY, a real environment, or a real stdin. The password is never a
// flag or an argument, so it can't leak into shell history, argv, or the process
// list (ADR-006). Unattended, it comes from an env var the caller names or from
// stdin (ADR `non-interactive-login`).
import { createInterface } from 'node:readline';
import { LoginFailedError } from '@albertomarturelo/nemo-core';

/** How long `--password-stdin` waits for its line. A file or a pipe from `printf`
 *  answers at once; a harness that leaves stdin as an open, silent pipe would
 *  otherwise hang the login forever. */
export const STDIN_TIMEOUT_MS = 10_000;

export interface Prompters {
  /** Prompt for a visible line of input. */
  line(question: string): Promise<string>;
  /** Prompt for a secret with echo suppressed. */
  hidden(question: string): Promise<string>;
}

export const nodePrompters: Prompters = {
  line(question: string): Promise<string> {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    return new Promise((resolve) => {
      rl.question(question, (answer) => {
        rl.close();
        resolve(answer.trim());
      });
    });
  },

  hidden(question: string): Promise<string> {
    const output = process.stdout;
    output.write(question);
    const rl = createInterface({ input: process.stdin, output, terminal: true });
    // Suppress echo by overriding readline's private write hook — the standard
    // no-dependency way to read a secret. We already printed the prompt above.
    const hook = rl as unknown as { _writeToOutput?: (chunk: string) => void };
    hook._writeToOutput = () => {};
    return new Promise((resolve) => {
      rl.question('', (answer) => {
        rl.close();
        output.write('\n');
        resolve(answer);
      });
    });
  },
};

/** The non-interactive password sources' view of the process. */
export interface ProcessInputs {
  /** The environment. A password variable is deleted from it once read, so no child
   *  process inherits it. */
  env: Record<string, string | undefined>;
  stdin: {
    /** True when stdin is a terminal, where `--password-stdin` refuses to read. */
    isTTY: boolean;
    /** The first line of stdin without its line break; `''` when stdin is empty.
     *  Rejects with `LoginFailedError` when no line arrives within the timeout. */
    readLine(): Promise<string>;
  };
}

export const nodeInputs: ProcessInputs = {
  env: process.env,
  stdin: {
    get isTTY(): boolean {
      return process.stdin.isTTY === true;
    },
    readLine(): Promise<string> {
      // readline strips the one `\n` / `\r\n` ending the line and keeps any other
      // whitespace, which may belong to the password.
      const rl = createInterface({ input: process.stdin, terminal: false, crlfDelay: Infinity });
      return new Promise((resolve, reject) => {
        let line: string | null = null;
        let timedOut = false;
        // `rl.close()` emits 'close' synchronously, so the timeout only flags itself
        // and lets the one 'close' handler settle the promise.
        const timer = setTimeout(() => {
          timedOut = true;
          rl.close();
        }, STDIN_TIMEOUT_MS);
        rl.once('line', (first) => {
          line = first;
          rl.close();
        });
        rl.once('close', () => {
          clearTimeout(timer);
          // Nothing reads stdin after this, and an open pipe would keep the process
          // alive after the command is done.
          process.stdin.destroy();
          if (timedOut) {
            reject(
              new LoginFailedError(
                `No password arrived on stdin within ${STDIN_TIMEOUT_MS / 1000} s — redirect it: \`--password-stdin < file\`.`,
              ),
            );
            return;
          }
          resolve(line ?? '');
        });
      });
    },
  },
};
