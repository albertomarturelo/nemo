// CLI-ONLY surface of @albertomarturelo/nemo-core (subpath `@albertomarturelo/nemo-core/cli`).
// `login` accepts a password argument, so it is DELIBERATELY kept out of the main
// barrel (`@albertomarturelo/nemo-core`) — the MCP server imports only the main barrel and
// must never wire a task that takes credentials (ADR-006). The terminal CLI, which
// prompts for the password with echo muted, imports this subpath instead.
export { login } from './tasks/auth.js';
export type { LoginResult } from './tasks/auth.js';
