// CLI-ONLY surface of @albertomarturelo/nemo-core (subpath `@albertomarturelo/nemo-core/cli`).
// `login` accepts a password argument, so it is DELIBERATELY kept out of the main
// barrel (`@albertomarturelo/nemo-core`) — the MCP server imports only the main barrel and
// must never wire a task that takes credentials (ADR-006). The terminal CLI, which
// prompts for the password with echo muted, imports this subpath instead.
// `unblock` lifts the rejection latch, which the MCP may report but never lift
// (ADR `non-interactive-login`), so it lives here too.
export { login, unblock } from './tasks/auth.js';
export type { LoginRequest, LoginResult, LoginSource, UnblockResult } from './tasks/auth.js';
