import { session } from 'electron';
import type { Session } from 'electron';

// Vite injects this global during build; undefined in production
declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;

/**
 * Build a Content Security Policy header string.
 *
 * Production (isDev=false): deny-by-default with explicit allow-list.
 * Development (isDev=true): relaxed for Vite HMR; connect-src derived from
 * devServerUrl (exact origin, not a wildcard).
 *
 * Enforcement mechanism: installCsp() registers onHeadersReceived for
 * HTTP/HTTPS responses (effective in the Vite dev server path). For production
 * file:// loads, onHeadersReceived does NOT fire in Electron 41 — a
 * <meta http-equiv="Content-Security-Policy"> fallback is injected into
 * index.html. Both mechanisms coexist safely; the header takes precedence when
 * both are present.
 */
export function buildCspHeader(isDev: boolean, devServerUrl?: string): string {
  if (isDev) {
    const connectSources = ["'self'"];
    if (devServerUrl) {
      const parsed = new URL(devServerUrl);
      const host = parsed.host;
      connectSources.push(`ws://${host}`, `wss://${host}`, `http://${host}`, `https://${host}`);
    }
    return [
      "default-src 'self'",
      "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      `connect-src ${connectSources.join(' ')}`,
      "object-src 'none'",
      "base-uri 'self'",
    ].join('; ');
  }

  return [
    "default-src 'none'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'none'",
    "object-src 'none'",
    "worker-src 'none'",
    "media-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join('; ');
}

/**
 * Register a webRequest.onHeadersReceived listener on the given Electron
 * session (defaults to session.defaultSession) that injects the CSP header
 * into every response.
 *
 * Call once in app.whenReady(), before createWindow(), to avoid duplicate
 * handler registration from the macOS activate path.
 */
export function installCsp(ses?: Session): void {
  const targetSession = ses ?? session.defaultSession;
  const isDev =
    typeof MAIN_WINDOW_VITE_DEV_SERVER_URL !== 'undefined' &&
    !!MAIN_WINDOW_VITE_DEV_SERVER_URL;
  const devUrl = isDev ? MAIN_WINDOW_VITE_DEV_SERVER_URL : undefined;
  const policy = buildCspHeader(isDev, devUrl);

  targetSession.webRequest.onHeadersReceived({ urls: ['<all_urls>'] }, (details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [policy],
      },
    });
  });
}
