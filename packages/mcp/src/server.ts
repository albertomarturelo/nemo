// The `nemo` MCP stdio server (ADR-003): every Resource/Tool is a thin call into a
// @albertomarturelo/nemo-core task — it never reaches past the task layer. The password NEVER
// crosses this boundary (ADR-006): `auth_login` takes NO arguments and delegates to a
// headed browser where the user types the password into Vector's own page; only the
// bearer token comes back (ADR `mcp-browser-login`). The password-taking `login`
// stays in the CLI-only `@albertomarturelo/nemo-core/cli` subpath, never imported here.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  API_BASE_URL,
  ENDPOINTS,
  authStatus,
  browserLogin,
  logout,
  type Runtime,
} from '@albertomarturelo/nemo-core';
import { toolJson, toolText } from './tool-helpers.js';
import { registerInstrumentsTools } from './tools/instruments.js';
import { registerCarteraTools } from './tools/cartera.js';

const jsonResource = (uri: URL, value: unknown) => ({
  contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(value, null, 2) }],
});

/** Build the MCP server over an injected Runtime (tests pass fakes; no network). */
export function buildServer(runtime: Runtime): McpServer {
  // The version is advertised in the initialize handshake, so it must equal
  // package.json — server.test.ts guards it. 0.0.0 while the package is private
  // and unreleased; the first publish sets the real version (ADR-015 shape).
  const server = new McpServer({ name: 'nemo', version: '0.0.0' });

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
  // auth_login blocks while the user signs in (up to BROWSER_LOGIN_TIMEOUT_MS). It
  // declares NO input schema: there is nothing a caller could pass a password in.
  server.registerTool(
    'auth_login',
    {
      title: 'Sign in (browser)',
      description:
        "Opens a browser window at Vector Capital's own sign-in page; the USER types their " +
        'credentials there. Never takes a password or username. Waits until sign-in completes ' +
        '(up to 5 minutes), then caches only the session token. Idempotent: does nothing when ' +
        'a session is already active.',
      annotations: { readOnlyHint: false, openWorldHint: true },
    },
    () =>
      toolText(async () => {
        const r = await browserLogin(runtime);
        return r.reason === 'already_authenticated'
          ? 'Already signed in — the session is active.'
          : 'Signed in. The session token is cached.';
      }),
  );

  server.registerTool(
    'auth_status',
    {
      title: 'Session status',
      description:
        'LOCAL read of the session (authenticated + coarse state). Never touches the network. ' +
        'When logged out or expired, call auth_login.',
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
  registerCarteraTools(server, runtime);

  return server;
}
