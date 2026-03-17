/**
 * e2e tests for Content Security Policy enforcement.
 *
 * The production app loads via file://, where Electron 41's onHeadersReceived
 * does not fire. The policy is enforced via a <meta http-equiv="Content-Security-Policy">
 * tag injected into index.html.
 *
 * Tests:
 * 1. Meta tag is present and contains the expected directives.
 * 2. Behavioral: injecting an inline <script> triggers a securitypolicyviolation
 *    event — proving the policy blocks execution, not just that the tag exists.
 */
import { test, expect } from '@playwright/test';
import { launchMockApp, skipOnboarding } from './helpers';

test.describe('Content Security Policy', () => {
  test('meta CSP tag is present with correct directives', async () => {
    const app = await launchMockApp();
    const window = await app.firstWindow();
    await window.waitForLoadState('domcontentloaded');
    await skipOnboarding(window);

    const cspContent = await window.evaluate(() => {
      const meta = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
      return meta?.getAttribute('content') ?? null;
    });

    expect(cspContent).not.toBeNull();
    expect(cspContent).toContain("connect-src 'none'");
    expect(cspContent).not.toContain("'unsafe-eval'");
    expect(cspContent).not.toContain("'unsafe-inline'");
    expect(cspContent).toContain("default-src 'none'");
    expect(cspContent).toContain("script-src 'self'");

    await app.close();
  });

  test('securitypolicyviolation fires when inline script is injected', async () => {
    const app = await launchMockApp();
    const window = await app.firstWindow();
    await window.waitForLoadState('domcontentloaded');
    await skipOnboarding(window);

    const blocked = await window.evaluate(() =>
      new Promise<boolean>((resolve) => {
        document.addEventListener('securitypolicyviolation', () => resolve(true), { once: true });
        setTimeout(() => resolve(false), 500);
        const s = document.createElement('script');
        s.textContent = 'window.__cspProbe = true';
        document.head.appendChild(s);
      }),
    );

    expect(blocked).toBe(true);

    await app.close();
  });
});
