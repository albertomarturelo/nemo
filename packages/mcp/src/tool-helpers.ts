// Shared MCP tool helpers. Each domain module owns a `tools/<mod>.ts` exporting a
// `register<Mod>Tools(server, runtime)`; they reuse these so the broker's error
// messages surface verbatim and JSON results render uniformly across modules.

import { classifyError, NotAuthenticatedError } from '@albertomarturelo/nemo-core';

/** A failed task as an error result: `{ error, type }`, the CLI's STDERR shape minus
 *  `exitCode` (ADR `non-interactive-login`). The core's message passes verbatim
 *  (CONVENTIONS); a missing/expired session also names the MCP's own remedy, since
 *  the core's wording points at the CLI. */
function errorResult(e: unknown): ToolResult {
  const { type, message } = classifyError(e);
  const error =
    e instanceof NotAuthenticatedError
      ? `${message} From here: call the auth_login tool.`
      : message;
  return { content: [{ type: 'text', text: JSON.stringify({ error, type }) }], isError: true };
}

export interface ToolResult {
  // The MCP SDK's tool-callback return type carries a string index signature
  // (CallToolResult); mirror it so our helpers are assignable to it.
  [key: string]: unknown;
  content: { type: 'text'; text: string }[];
  isError?: boolean;
}

/** Run a task and wrap its text as a tool result; a failure comes back as an
 *  `errorResult`. */
export async function toolText(fn: () => Promise<string>): Promise<ToolResult> {
  try {
    return { content: [{ type: 'text', text: await fn() }] };
  } catch (e) {
    return errorResult(e);
  }
}

/** Same as `toolText` but pretty-prints the task's object as JSON — the default for
 *  read tools (the @albertomarturelo/nemo-core result IS the integration contract). */
export async function toolJson(fn: () => Promise<unknown>): Promise<ToolResult> {
  try {
    return { content: [{ type: 'text', text: JSON.stringify(await fn(), null, 2) }] };
  } catch (e) {
    return errorResult(e);
  }
}
