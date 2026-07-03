// Terminal prompters, injectable so tests drive the login flow without a TTY. The
// password prompt mutes echo — the password is never a flag/arg/env, so it can't
// leak into shell history, argv, or the process list (ADR-006).
import { createInterface } from 'node:readline';

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
