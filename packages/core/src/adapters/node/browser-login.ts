// Node default for the `BrowserLogin` seam (ADR `mcp-browser-login`): a HEADED
// browser at Vector's own sign-in page. The user types the password into Vector's
// form; we only watch for the SignIn RESPONSE and keep its `token`. The request
// body (where the password travels) is never read — no `postData()` anywhere.
//
// `playwright` is an optional peer, imported lazily so `@albertomarturelo/nemo-core/node`
// still loads where it is absent (an embedder that never signs in by browser).
// Type-only imports are erased at compile time.
import type { Browser, BrowserType, Response } from 'playwright';
import { API_BASE_URL, ENDPOINTS, PORTAL_URL, WEB_SIGN_IN_PATH } from '../../config/index.js';
import { tokenFromSignIn } from '../../auth/service.js';
import { ContractError, LoginFailedError } from '../../errors/index.js';
import type { BrowserLogin, BrowserSignInOptions } from '../../seams/index.js';

const INSTALL_HINT =
  'No browser available for sign-in. Run `npx playwright install chromium` (or install Google Chrome) and retry.';

async function loadChromium(): Promise<BrowserType> {
  try {
    return (await import('playwright')).chromium;
  } catch {
    throw new LoginFailedError(
      `Browser sign-in needs the \`playwright\` package, which is not installed. ${INSTALL_HINT}`,
    );
  }
}

/** Playwright's bundled Chromium first; an installed Chrome when that build is
 *  missing (the common case for a fresh `npx` install). */
async function launchHeaded(chromium: BrowserType): Promise<Browser> {
  try {
    return await chromium.launch({ headless: false });
  } catch {
    try {
      return await chromium.launch({ headless: false, channel: 'chrome' });
    } catch {
      throw new LoginFailedError(INSTALL_HINT);
    }
  }
}

// Observed 2026-10-15: the SPA POSTs here and gets `{ token, user, systemConfig }`.
const SIGN_IN = new URL(`${API_BASE_URL}${ENDPOINTS.signIn}`);
const isSignInSuccess = (res: Response): boolean => {
  const url = new URL(res.url());
  return (
    url.origin === SIGN_IN.origin &&
    url.pathname.toLowerCase() === SIGN_IN.pathname.toLowerCase() &&
    res.request().method() === 'POST' &&
    res.ok()
  );
};

export class PlaywrightBrowserLogin implements BrowserLogin {
  async signIn(options: BrowserSignInOptions): Promise<string> {
    const browser = await launchHeaded(await loadChromium());
    try {
      const page = await browser.newPage();
      // Armed before navigating so no response can slip past. Only a 2xx counts: a
      // wrong password is a 4xx the user can correct on Vector's page, and that
      // page — not us — owns the retry. Closing the window rejects this wait.
      const signedIn = page.waitForResponse(isSignInSuccess, { timeout: options.timeoutMs });
      // If navigation fails, `finally` closes the browser and rejects this wait;
      // keep that rejection from surfacing as an unhandled one.
      signedIn.catch(() => undefined);
      try {
        await page.goto(`${PORTAL_URL}${WEB_SIGN_IN_PATH}`, { waitUntil: 'domcontentloaded' });
      } catch (error) {
        throw new LoginFailedError(
          `Could not open Vector's sign-in page: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`,
        );
      }

      let response: Response;
      try {
        response = await signedIn;
      } catch {
        throw new LoginFailedError(
          'Sign-in not completed (timed out or the browser window was closed). Call auth_login again.',
        );
      }
      const token = tokenFromSignIn(await response.json());
      if (token === null) {
        throw new ContractError(
          "SignIn response from the web login had no top-level 'token' string — the contract drifted (docs/vector-contract/auth.md).",
        );
      }
      return token;
    } finally {
      // Close on EVERY path so a launched browser never leaks.
      await browser.close().catch(() => undefined);
    }
  }
}
