// Shared MCP tool helpers. Each domain module owns a `tools/<mod>.ts` exporting a
// `register<Mod>Tools(server, runtime)`; they reuse these so the broker's error
// messages surface verbatim and JSON results render uniformly across modules.

const messageOf = (e: unknown): string => (e instanceof Error ? e.message : String(e));

export interface ToolResult {
  // The MCP SDK's tool-callback return type carries a string index signature
  // (CallToolResult); mirror it so our helpers are assignable to it.
  [key: string]: unknown;
  content: { type: 'text'; text: string }[];
  isError?: boolean;
}

/** Run a task and wrap its text as a tool result; domain errors come back as an
 *  error result carrying the message verbatim (CONVENTIONS). */
export async function toolText(fn: () => Promise<string>): Promise<ToolResult> {
  try {
    return { content: [{ type: 'text', text: await fn() }] };
  } catch (e) {
    return { content: [{ type: 'text', text: messageOf(e) }], isError: true };
  }
}

/** Same as `toolText` but pretty-prints the task's object as JSON — the default for
 *  read tools (the @albertomarturelo/nemo-core result IS the integration contract). */
export async function toolJson(fn: () => Promise<unknown>): Promise<ToolResult> {
  try {
    return { content: [{ type: 'text', text: JSON.stringify(await fn(), null, 2) }] };
  } catch (e) {
    return { content: [{ type: 'text', text: messageOf(e) }], isError: true };
  }
}
