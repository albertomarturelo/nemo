// The `nemo` MCP stdio server (ADR-003): every Resource/Tool is a thin call into a
// @albertomarturelo/nemo-core task — it never reaches past the task layer. The password NEVER
// crosses this boundary: there is NO sign-in tool. Signing in takes credentials, so
// it is CLI-only (`nemo auth login`); the MCP surface offers status, logout, and read
// tools over an already-established session (ADR-006).
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  API_BASE_URL,
  ENDPOINTS,
  authStatus,
  logout,
  type Runtime,
} from '@albertomarturelo/nemo-core';
import { toolJson, toolText } from './tool-helpers.js';
import { registerInstrumentsTools } from './tools/instruments.js';
import { registerPortfolioTools } from './tools/portfolio.js';

const jsonResource = (uri: URL, value: unknown) => ({
  contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(value, null, 2) }],
});

/** Build the MCP server over an injected Runtime (tests pass fakes; no network). */
export function buildServer(runtime: Runtime): McpServer {
  const server = new McpServer({ name: 'nemo', version: '0.1.0' });

  // --- Resources: read-only context the model reads to orient ---
  server.registerResource(
    'session',
    'nemo://session',
    {
      title: 'Session state',
      description:
        'LOCAL session state (authenticated + coarse token state). Never touches the network.',
      mimeType: 'application/json',
    },
    async (uri) => jsonResource(uri, await authStatus(runtime)),
  );

  server.registerResource(
    'config',
    'nemo://config',
    {
      title: 'Portal configuration',
      description:
        'Vector Capital base URL + the observed endpoints (single source of truth, ADR-004).',
      mimeType: 'application/json',
    },
    (uri) => jsonResource(uri, { baseUrl: API_BASE_URL, endpoints: ENDPOINTS }),
  );

  // --- Tools: actions, each a thin call into a @albertomarturelo/nemo-core task ---
  server.registerTool(
    'auth_status',
    {
      title: 'Session status',
      description:
        'LOCAL read of the session (authenticated + coarse state). Never touches the network. ' +
        'There is NO sign-in tool — sign in with the CLI `nemo auth login` (ADR-006).',
      annotations: { readOnlyHint: true },
    },
    () => toolJson(() => authStatus(runtime)),
  );

  // logout carries no secret (local token wipe), so ADR-006 does not bar it from MCP.
  server.registerTool(
    'auth_logout',
    {
      title: 'Log out',
      description: 'Drop the cached bearer token. Takes no arguments.',
      annotations: { readOnlyHint: false },
    },
    () =>
      toolText(async () => {
        const r = await logout(runtime);
        return r.loggedOut ? 'Logged out.' : 'No active session.';
      }),
  );

  // --- domain read surfaces (one register call per module — append-only) ---
  registerInstrumentsTools(server, runtime);
  registerPortfolioTools(server, runtime);

  return server;
}
