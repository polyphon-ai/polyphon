# Sprint 006: Renderer Content Security Policy

## Overview

Polyphon's main process is progressively hardened: API keys never cross IPC in plaintext,
at-rest encryption is live (Sprint 004), and IPC input validation is queued (Sprint 005). The
renderer process is the remaining surface: it displays user-supplied message content and
AI-generated text inside a long-lived Electron window. There is currently no Content Security
Policy restricting what the renderer can execute or connect to.

This sprint adds a strict CSP via Electron's `webRequest.onHeadersReceived` hook — the
Electron-recommended mechanism for enforcing CSP on renderer responses. The production policy
is deny-by-default (`default-src 'none'`) with explicit allow-listing; no `'unsafe-inline'`,
no `'unsafe-eval'`, no renderer network connections. The development policy is relaxed for
Vite HMR and is strictly gated behind `MAIN_WINDOW_VITE_DEV_SERVER_URL`.

The sprint opens with an explicit verification step: confirming whether `onHeadersReceived`
intercepts `file://` responses in Electron 41 (the production load path). If it does not, the
fallback is a `<meta http-equiv="Content-Security-Policy">` tag injected into the Vite HTML
template. Both mechanisms can coexist.

---

## Use Cases

1. **Injected script is blocked** — a future bug in a markdown renderer or HTML-rendering
   component leads to `<script>` injection in the DOM; the CSP prevents execution
2. **Renderer cannot phone home** — a buggy or malicious library calls `fetch()` to an
   external URL; `connect-src 'none'` blocks it before any data leaves the renderer
3. **Dev server works unchanged** — `npm start` / `make dev` HMR continues; React renders;
   Tailwind styles apply; no CSP violations in DevTools console
4. **E2E tests pass unchanged** — existing Playwright specs are unaffected; the new CSP spec
   passes alongside them
5. **CI gate** — `make test-e2e` asserts CSP header presence, catching any future removal

---

## Architecture

```
app.whenReady() in src/main/index.ts
  ├── loadShellEnv()
  ├── initFieldEncryption(key)       [Sprint 004]
  ├── getDb()
  ├── installCsp()                   ← NEW: register once, before createWindow()
  │     ├── isDev = !!MAIN_WINDOW_VITE_DEV_SERVER_URL
  │     ├── policy = buildCspHeader(isDev, devServerUrl)
  │     └── session.defaultSession.webRequest.onHeadersReceived(
  │           { urls: ['<all_urls>'] },
  │           (details, callback) =>
  │             callback({ responseHeaders: {
  │               ...details.responseHeaders,
  │               'Content-Security-Policy': [policy]
  │             }})
  │         )
  ├── registerIpcHandlers(db, ...)
  └── createWindow()

src/main/security/csp.ts  (new)
  export function buildCspHeader(isDev: boolean, devServerUrl?: string): string

e2e/csp.spec.ts  (new)
  → launch production app
  → observe response for main window URL
  → assert 'content-security-policy' header present and non-empty
  → assert header includes 'connect-src' and excludes 'unsafe-eval'

src/main/security/csp.test.ts  (new)
  → unit tests for buildCspHeader
```

**Production CSP (strict, deny-by-default):**
```
default-src 'none';
script-src 'self';
style-src 'self';
img-src 'self' data:;
font-src 'self';
connect-src 'none';
object-src 'none';
worker-src 'none';
media-src 'none';
base-uri 'none';
form-action 'none';
frame-ancestors 'none';
```

**Development CSP (relaxed for Vite HMR, derived from actual dev origin):**
```
default-src 'self';
script-src 'self' 'unsafe-eval';
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob:;
font-src 'self' data:;
connect-src 'self' ws://<devHost> http://<devHost>;
object-src 'none';
base-uri 'self';
```
Where `<devHost>` is derived from `devServerUrl` (e.g. `ws://localhost:5173`), not a
hardcoded wildcard.

**Notes on directive choices:**
- `default-src 'none'` in prod — deny-by-default; explicit directives enumerate every needed type
- `img-src data:` — React may use data: URIs for dynamically generated images
- `font-src 'self'` — Geist is bundled locally; no CDN
- `connect-src 'none'` in prod — enforces the invariant that the renderer makes no network calls
- `object-src 'none'` — disables Flash/plugin execution vectors
- `base-uri 'none'` — prevents base-tag injection attacks
- `frame-ancestors 'none'` — prevents clickjacking
- Dev `connect-src` uses the exact origin from `MAIN_WINDOW_VITE_DEV_SERVER_URL`

**Registration point:** `installCsp()` is called once in `app.whenReady()` before
`createWindow()`. This avoids the duplicate-handler risk from the macOS `activate` path,
which calls `createWindow()` again when all windows are closed.

---

## Implementation Plan

### P0: Must Ship

**Files:**
- `src/main/security/csp.ts` — new; `buildCspHeader(isDev, devServerUrl?)` + `installCsp()`
- `src/main/security/csp.test.ts` — new; unit tests for CSP string builder
- `src/main/index.ts` — import and call `installCsp()` once in `app.whenReady()`
- `e2e/csp.spec.ts` — new; e2e assertion: CSP header present in production build response

**Tasks:**
- [ ] **Verify `file://` interception first**: build the app (`make build`) and confirm whether
      `onHeadersReceived` fires for `file://` responses in Electron 41. Add a `console.log` in
      the hook to confirm it fires during a test run. Record the outcome in a code comment in
      `csp.ts`. If it does not fire, add `<meta http-equiv="Content-Security-Policy" content="...">` to
      the Vite HTML template (`index.html`) as a fallback. **Note**: if the `<meta>` fallback is
      used, the `frame-ancestors` and `form-action` directives must be omitted from the meta tag
      (not supported in `<meta>` CSP); they remain in the HTTP header if that path also fires.
      The header hook and meta tag can coexist.
- [ ] Create `src/main/security/csp.ts`:
      - `buildCspHeader(isDev: boolean, devServerUrl?: string): string` — pure function
      - `installCsp(ses?: Electron.Session): void` — registers `onHeadersReceived` on the
        provided session (defaults to `session.defaultSession`)
- [ ] Create `src/main/security/csp.test.ts`:
      - `buildCspHeader(false)` contains `script-src 'self'`, `connect-src 'none'`,
        `object-src 'none'`, `default-src 'none'`
      - `buildCspHeader(false)` does not contain `'unsafe-eval'` or `'unsafe-inline'`
      - `buildCspHeader(true, 'http://localhost:5173')` contains `'unsafe-eval'` and
        `ws://localhost:5173`
      - `buildCspHeader(true, 'http://localhost:5173')` does not contain `ws://localhost:*`
        (confirm exact origin, not wildcard)
- [ ] Modify `src/main/index.ts`: call `installCsp()` in `app.whenReady()` before
      `registerIpcHandlers()` and `createWindow()`. Import from `./security/csp`.
- [ ] Create `e2e/csp.spec.ts`:
      - Launch app via `launchMockApp()`
      - **Header presence check**: Use `electronApp.evaluate()` (not `page.on('response')` —
        Playwright's response events may not fire for `file://` URLs) to read the CSP header
        via a one-shot `onHeadersReceived` listener registered in the Electron main process
        context. If the `<meta>` fallback is in use instead, assert
        `document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.content` via
        `page.evaluate()`.
      - Assert CSP value is present, contains `connect-src 'none'`, and excludes `unsafe-eval`
      - **Behavioral check** (mandatory, not optional): use `page.evaluate()` to create an
        inline `<script>` element, listen for `securitypolicyviolation` event, and assert the
        event fires (proving inline scripts are blocked, not just that the policy string exists):
        ```ts
        const blocked = await page.evaluate(() => new Promise<boolean>(resolve => {
          document.addEventListener('securitypolicyviolation', () => resolve(true), { once: true });
          setTimeout(() => resolve(false), 500);
          const s = document.createElement('script');
          s.textContent = 'window.__cspProbe = true';
          document.head.appendChild(s);
        }));
        expect(blocked).toBe(true);
        ```
- [ ] Manual smoke test: `npm start` → DevTools console shows no CSP violations; React
      renders; HMR works
- [ ] Verify unlock window (`?view=unlock`, Sprint 004) renders correctly under production CSP

### P1: Ship If Capacity Allows

- [ ] Negative unit test: `buildCspHeader(false, 'http://localhost:5173')` — even if
      `devServerUrl` is passed, `isDev=false` must not include `'unsafe-eval'`
- [ ] E2E behavioral test for `connect-src 'none'`: attempt `fetch()` from renderer context
      and assert it rejects with a network error

### Deferred

- **CSP violation reporting** (`report-uri` / `report-to`) — no telemetry without explicit
  opt-in; inconsistent with project principles
- **Nonce-based strict CSP** — replaces `'self'` with per-request nonces; cleaner but
  requires Vite plugin work and HTML template threading
- **Custom protocol (`app://`)** — cleaner CSP origin model; large scope increase for
  marginal benefit vs `'self'` on a local file bundle

---

## Files Summary

| File | Action | Purpose |
|------|--------|---------|
| `src/main/security/csp.ts` | Create | `buildCspHeader` + `installCsp` — policy builder and registration |
| `src/main/security/csp.test.ts` | Create | Unit tests for CSP string output |
| `src/main/index.ts` | Modify | Call `installCsp()` once before `createWindow()` |
| `e2e/csp.spec.ts` | Create | E2E assertion: CSP header on main window response |
| `index.html` (Vite template) | Modify (conditional) | `<meta>` CSP fallback if `file://` interception fails |
| `CLAUDE.md` | Modify | Add Security section documenting CSP invariants |

---

## Definition of Done

- [ ] `buildCspHeader(false)` returns a string with `script-src 'self'`, `style-src 'self'`,
      `connect-src 'none'`, `object-src 'none'`, `worker-src 'none'`, `media-src 'none'`,
      `default-src 'none'`
- [ ] `buildCspHeader(false)` does not contain `'unsafe-eval'` or `'unsafe-inline'`
- [ ] `buildCspHeader(true, devUrl)` contains `'unsafe-eval'`, `'unsafe-inline'`, and derives
      `connect-src` from the actual dev URL (not a broad wildcard)
- [ ] `installCsp()` is called exactly once in `app.whenReady()`, before `createWindow()`
- [ ] `make test-unit` passes (csp.test.ts)
- [ ] `make test-e2e` passes including csp.spec.ts
- [ ] Production CSP enforcement mechanism is documented in a code comment in `csp.ts` (header,
      meta fallback, or both — based on P0 verification result)
- [ ] CSP value contains `connect-src 'none'` and excludes `unsafe-eval` in production
- [ ] **Behavioral test passes**: `securitypolicyviolation` event fires when inline script is
      injected in the renderer — proving the policy blocks execution, not just that it exists
- [ ] Unlock window (`?view=unlock`) renders correctly under production CSP
- [ ] All existing unit, integration, and e2e tests pass unchanged
- [ ] `src/main/index.ts` changes are additive with Sprint 004's startup flow
- [ ] `CLAUDE.md` updated with a Security section documenting the CSP policy split

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| `onHeadersReceived` does not fire for `file://` in Electron 41 | Medium | High | **P0 task**: verify first; if not supported, add `<meta>` tag fallback to Vite HTML template |
| Tailwind v4 prod build uses inline `<style>` elements | Low | Medium | Check build output for inline styles; add `'unsafe-inline'` to prod `style-src` only if confirmed needed (and document the relaxation) |
| Unlock window (Sprint 004) breaks under strict CSP | Low | Medium | Unlock window loads the same bundle; verify `?view=unlock` route renders correctly under prod policy |
| Dev `connect-src` origin mismatch (different Vite port) | Low | Low | Derive from `MAIN_WINDOW_VITE_DEV_SERVER_URL` at runtime, not hardcoded |
| Sprint 004 merge conflict in `src/main/index.ts` | Medium | Low | CSP install call is a single additive line; trivial to rebase |

---

## Security Considerations

- `default-src 'none'` in production: deny-by-default. Every permitted resource type is
  explicitly listed, minimising future accidental relaxations.
- `connect-src 'none'`: enforces at browser-policy level the architectural invariant that
  the renderer makes zero network calls. All API traffic flows through IPC.
- `base-uri 'none'`: prevents base-tag injection, a known CSP bypass used to redirect
  relative script `src` attributes to attacker-controlled origins.
- `frame-ancestors 'none'`: prevents clickjacking via renderer framing.
- `object-src 'none'`: disables Flash and NPAPI plugin execution.
- Dev relaxations (`'unsafe-eval'`, `'unsafe-inline'`) are strictly gated behind
  `MAIN_WINDOW_VITE_DEV_SERVER_URL` truthiness — they will never appear in a production build
  because that global is `undefined` in the packaged app.
- `installCsp()` is registered once on `session.defaultSession`, not per window. This ensures
  the policy is applied before any window can load content and avoids duplicate handler
  registration from the macOS `activate` path.

---

## Observability & Rollback

- **Post-ship verification**: `make test-e2e` → `csp.spec.ts` fails if the header is absent
  or wrong; existing specs catch rendering regressions
- **Dev visibility**: CSP violations appear in Electron DevTools → Console as
  `Content Security Policy` entries — easy to spot during any development session
- **Rollback**: remove the `installCsp()` call from `src/main/index.ts` and delete
  `src/main/security/csp.ts`. No database migration, no persisted state change. Full revert
  in one commit.

---

## Documentation

- [ ] Add a **Security** section to `CLAUDE.md` covering:
  - CSP is enforced on all main window renderer responses via `session.defaultSession`
  - Production policy is `default-src 'none'` with explicit allow-list (see `csp.ts`)
  - Development policy is relaxed for Vite HMR; gated by `MAIN_WINDOW_VITE_DEV_SERVER_URL`
  - Future renderer changes must not require adding `'unsafe-inline'` or `'unsafe-eval'` to
    the production policy — if a new feature would require this, raise it explicitly

---

## Dependencies

- **Sprint 004** (At-Rest Encryption) — in-progress; touches `src/main/index.ts`. Apply
  this sprint's changes after Sprint 004 merges. The CSP change is additive (one new import +
  one `installCsp()` call) and does not conflict with encryption startup sequencing.
- **Sprint 005** (IPC Input Validation) — independent; no conflict.

---

## Open Questions

_None blocking._ The `file://` question is resolved at the start of P0 implementation; the
sprint plan accommodates both outcomes.
