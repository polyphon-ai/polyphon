# Polyphon Security Review

**Date:** 2026-03-17
**Reviewer:** Claude Code (static analysis)
**Codebase state:** `8b0c039e0266a9e3c15c0336c69c0543e2ba461e` — fix(ipc): repair three validation regressions that broke all e2e tests
**Scope:** Full static review of `src/`, `forge.config.ts`, `package.json`, `.github/`

---

## Executive Summary

Polyphon has a strong foundational security posture. The most important defensive controls are all correctly implemented: Electron Fuses are fully hardened, `contextIsolation` is on and `nodeIntegration` is off, the production CSP is deny-by-default with `connect-src 'none'`, AES-256-GCM field encryption is correctly implemented with a typed branded-type enforcement system, IPC inputs are validated through a shared `validate.ts` layer, and `shell:openExternal` is gated behind a tight allowlist. There is no `dangerouslySetInnerHTML` or `eval` usage in the renderer, and API keys never cross the IPC boundary in plaintext.

The most significant findings are: the Linux AppImage unconditionally launches with `--no-sandbox`, removing Chromium's renderer sandbox on Linux (CRIT-001); no explicit `setWindowOpenHandler` deny policy is registered (HIGH-001); the Copilot CLI voice is launched with `--allow-all-tools`, granting the subprocess unrestricted tool execution (HIGH-003); custom provider `baseUrl` values are not blocked from targeting private/loopback network addresses (HIGH-002); and GitHub Actions workflows reference third-party actions by mutable tags rather than commit SHAs, with a long-lived PAT passed to an unpinned action (MED-004/MED-005). None of the cryptographic primitives are fundamentally broken, and the AES-256-GCM implementation is correct.

The scrypt work factor for password-derived key wrapping (N=16384) is below the OWASP-recommended value for a stored-secret KDF; raising it is low-effort. Several findings around the Gemini API key, the `conductor_avatar` photo, the `cliArgs` validation gap, and the Copilot prompt-as-CLI-arg are also actionable with low effort.

---

## Findings

### CRIT-001 — Linux AppImage Disables Electron's Renderer Sandbox
**Severity:** Critical
**Status:** Fixed
**Location:** `forge.config.ts:26`
**Description:** The Linux packaging hook wraps the Electron binary with a shell script that unconditionally passes `--no-sandbox`. This disables Chromium's namespace/seccomp sandbox for the renderer process on every Linux installation. Without the sandbox, a renderer-process exploit (e.g. from a malicious AI-generated response if rich content rendering is added, or from a compromised npm dependency) would gain direct host-system access with no sandbox barrier. The main window also uses a privileged preload, so a compromised renderer on Linux has an unobstructed path into all IPC operations.
**Recommendation:** Remove `--no-sandbox` from production Linux packages. If specific AppImage environments genuinely lack a SUID sandbox, gate the workaround behind an explicit developer flag and treat sandbox-capable packaging as a release blocker. Evaluate distributing a `.deb`/`.rpm` instead of (or alongside) the AppImage, as those packaging formats support the SUID `chrome-sandbox` binary.
**Resolved in Sprint 012:** `afterComplete` wrapper removed entirely from `forge.config.ts`. AppImage packaging is dropped from the production release path. `.deb` and `.rpm` packages are now the Linux release artifacts, using the SUID `chrome-sandbox` binary to establish the Chromium renderer namespace/seccomp sandbox natively.

---

### HIGH-001 — Main Window Has No Explicit Navigation Deny Policy
**Severity:** High
**Status:** Fixed
**Location:** `src/main/index.ts` (BrowserWindow creation)
**Description:** `createWindow()` does not register `win.webContents.setWindowOpenHandler()`, `win.webContents.on('will-navigate')`, or any equivalent guard. If the renderer navigates to an attacker-controlled origin (e.g. via a future markdown renderer, an injected link, or a compromised dependency), the preload script will run on that page, exposing `window.polyphon` and all IPC channels to remote content. This is one of the most critical Electron hardening controls and is currently absent.
**Recommendation:** Add `win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))` and `win.webContents.on('will-navigate', (event) => event.preventDefault())`. Route all approved external links through the hardened `shell:openExternal` allowlist path.
**Resolution:** `setWindowOpenHandler` now returns `{ action: 'deny' }` for all popup requests. A `will-navigate` listener calls `event.preventDefault()` on every navigation event, ensuring the renderer can never leave the app origin. External links continue to route through the `shell:openExternal` IPC allowlist.

---

### HIGH-002 — Custom Provider `baseUrl` Allows SSRF Against Private Network Addresses
**Severity:** High
**Status:** Fixed
**Location:** `src/main/ipc/settingsHandlers.ts` (`fetchModels`, `fetchCustomProviderModels`, `probeModel`); `src/main/voices/providers/openai-compat.ts`; `src/main/ipc/validate.ts` (`requireUrl`)
**Description:** `requireUrl` enforces `http:` or `https:` protocol but does not block RFC 1918 private ranges (10.x, 172.16–31.x, 192.168.x), loopback (`127.x`, `::1`), link-local (`169.254.x`), or the AWS IMDS endpoint (`169.254.169.254`). The main process issues `fetch()` directly to `${baseUrl}/models` and the `openai-compat` voice sends all conversation traffic to attacker-controlled `baseUrl`s. Additionally, the `apiKeyEnvVar` field accepts an arbitrary environment variable name; any value from `process.env` can be read and exfiltrated as an `Authorization` header to an attacker-controlled endpoint.

In the current single-user local threat model this is not remotely exploitable — the user controls their machine. However, if composition files are ever imported or shared between users, a malicious composition could probe internal network services or exfiltrate environment secrets from the recipient's machine.
**Recommendation:** Add a hostname/IP blocklist in `requireUrl` (or a dedicated `requireExternalUrl` helper) rejecting RFC 1918, loopback, and link-local addresses. Validate `apiKeyEnvVar` against a strict allowlist or prefix (`POLYPHON_*`) rather than accepting arbitrary env var names.
**Resolution:** Added `requireExternalUrl` to `validate.ts` — a wrapper around `requireUrl` that additionally rejects RFC 1918 (10.x, 172.16–31.x, 192.168.x), link-local/IMDS (169.254.x), IPv6 ULA (fc00::/7), IPv6 link-local (fe80::/10), and `.local` mDNS hostnames. Loopback (127.x, ::1, `localhost`) is intentionally permitted because Ollama and LM Studio — explicitly supported providers — run on localhost. Both `CUSTOM_PROVIDER_CREATE` and `CUSTOM_PROVIDER_UPDATE` handlers now call `requireExternalUrl` instead of `requireUrl`. Added `requireEnvVarName` which validates `apiKeyEnvVar` against `ENV_VAR_NAME_RE` (`/^[A-Za-z_][A-Za-z0-9_]*$/`), rejecting arbitrary strings while allowing any valid POSIX env var name. Both create and update handlers validate `apiKeyEnvVar` when present and non-empty.

---

### HIGH-003 — Copilot CLI Voice Launched with `--allow-all-tools`
**Severity:** High
**Status:** Fixed
**Location:** `src/main/voices/providers/copilot.ts`
**Description:** The Copilot provider invokes the CLI as:
```
spawn(cliCommand, [...cliArgs, '-p', prompt, '--allow-all-tools'])
```
`--allow-all-tools` bypasses tool-use confirmation prompts, allowing any content in the conversation — including responses from other voices — to cause the Copilot subprocess to take host-side actions (file system writes, shell commands, network requests) without any approval checkpoint. In a multi-agent orchestration app where one AI response can become another's input, this creates a direct path from model-generated text to unrestricted host-side tool execution.
**Recommendation:** Remove `--allow-all-tools` from the default invocation. If tool-enabled CLI voices are a desired feature, make them an explicit opt-in with a UI warning, and prefer an approval-required mode for the default invocation.

---

### MED-001 — BrowserWindow Security Options Rely on Implicit Defaults
**Severity:** Medium
**Status:** Fixed
**Location:** `src/main/index.ts`; `src/main/security/unlockWindow.ts`
**Description:** `BrowserWindow` options for the main window and unlock window specify only `preload` without explicitly setting `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`, `webSecurity: true`, or `allowRunningInsecureContent: false`. Current Electron defaults produce the correct values, but relying on implicit defaults makes security assumptions invisible to reviewers and fragile against future Electron version changes.
**Recommendation:** Set all security-relevant `BrowserWindow` options explicitly on every window, even when the value matches the current default. Consider setting `sandbox: true` explicitly (Electron enables it by default when `contextIsolation: true` and no preload is used, but the interaction with a preload script varies by version).
**Resolution:** Both `createWindow()` in `src/main/index.ts` and `createUnlockWindow()` in `src/main/security/unlockWindow.ts` now explicitly set `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`, `webSecurity: true`, and `allowRunningInsecureContent: false` in `webPreferences`. Security posture is now self-documenting and invariant to Electron default changes.

---

### MED-002 — `conductor_avatar` (User Photo) Not Encrypted at Rest
**Severity:** Medium
**Status:** Fixed
**Location:** `src/main/db/encryptionManifest.ts`; `src/main/db/queries/userProfile.ts`
**Description:** The `user_profile` table encrypts `conductor_name`, `pronouns`, and `conductor_context` but leaves `conductor_avatar` in plaintext. This column stores a base64-encoded image data URI that may contain a portrait photograph of the user — PII of comparable or greater sensitivity to the other encrypted fields. Any process that can read the SQLite file (without knowing the encryption key) can extract the avatar image directly.
**Recommendation:** Add `conductor_avatar` to `ENCRYPTED_FIELDS['user_profile']` in `encryptionManifest.ts`, update `UserProfileRow`, add a manifest integration test assertion, and write a migration for existing rows.
**Resolution:** `conductor_avatar` added to `ENCRYPTED_FIELDS['user_profile']`. `UserProfileRow.conductor_avatar` is now typed as `EncryptedField`. `upsertUserProfile` calls `encryptField()` and `rowToProfile` calls `decryptField()`. Migration `003_encrypt_conductor_avatar.ts` encrypts existing plaintext rows on upgrade (idempotent: skips rows already prefixed `ENC:v1:`). `SCHEMA_VERSION` bumped to 3. The encryption manifest integration test asserts `conductor_avatar` is stored as `ENC:v1:…` and round-trips correctly.

---

### MED-003 — scrypt Work Factor Below OWASP Recommendation
**Severity:** Medium
**Status:** Fixed
**Location:** `src/main/security/keyManager.ts` (scrypt KDF)
**Description:** `scryptSync(password, salt, 32, { N: 16384, r: 8, p: 1 })` uses `N=2^14`. OWASP recommends `N=2^17` (131072) for stored-secret KDFs. Because the scrypt output protects the entire AES-256-GCM database key, an attacker with the key file can attempt offline brute-force at the cost of evaluating scrypt. At `N=16384`, modern hardware can evaluate many candidates per second against weak or common passwords. Since key derivation runs only at app unlock (not per-operation), a higher `N` has negligible UX impact.
**Recommendation:** Increase `N` to `65536` or `131072`. Bump the key file format version so existing users are re-derived on next unlock.
**Resolution:** `wrapWithPassword` now uses `N: 65536` (2^16) and stores `kdfN: 65536` in the key file. `unwrapWithPassword` reads `data.kdfN ?? 16384`, providing backward compatibility with key files written by older versions. New password-protected key files are derived with the higher work factor; legacy files continue to unlock correctly.

---

### MED-004 — Several IPC Handlers Accept Typed Inputs Without `requireObject` Gate
**Severity:** Medium
**Status:** Fixed
**Location:** `src/main/ipc/settingsHandlers.ts` (tone and system prompt template handlers)
**Description:** The `SETTINGS_TONE_CREATE`, `SETTINGS_TONE_UPDATE`, `SETTINGS_SYSTEM_PROMPT_TEMPLATE_CREATE`, and `SETTINGS_SYSTEM_PROMPT_TEMPLATE_UPDATE` handlers accept their `data` parameters typed as `Pick<ToneDefinition, ...>` and `Partial<Pick<...>>` rather than `unknown`. They validate individual string fields inline, but do not call `requireObject()` first. A non-object argument (e.g. `null`, an array) can reach field access before validation fires and produce a confusing runtime TypeError.
**Recommendation:** Accept `data: unknown`, call `requireObject(data, 'data')`, then access fields — consistent with the pattern used in other handlers.
**Resolution:** All four handlers now accept `data: unknown` and call `requireObject(data, 'data')` before field access. Consistent with the validation pattern established in the rest of `settingsHandlers.ts`.

---

### MED-005 — GitHub Actions Workflows Use Mutable Tag References
**Severity:** Medium
**Status:** Fixed
**Location:** `.github/workflows/release.yml`; `.github/workflows/deploy-site.yml`
**Description:** All third-party GitHub Actions are pinned to mutable major-version tags (`actions/checkout@v6`, `softprops/action-gh-release@v2`, `peaceiris/actions-hugo@v3`, etc.) rather than full commit SHAs. Additionally, `upload-artifact@v7` is used in one step while all others use `@v4` — a version inconsistency suggesting a copy-paste error. The `RELEASES_REPO_TOKEN` PAT (which has write access to the releases repository) is passed to the unpinned `softprops/action-gh-release@v2` action; if that action is compromised, the token could be exfiltrated.
**Recommendation:** Pin all third-party actions to full commit SHAs. Audit and fix the `upload-artifact@v7` vs `@v4` inconsistency. Audit `RELEASES_REPO_TOKEN` scope to verify it is limited to `contents: write` on the releases repository only.
**Resolution:** All third-party actions in both workflows are now pinned to full commit SHAs with the tag as an inline comment (e.g. `actions/checkout@de0fac2e… # v6`). The `upload-artifact@v7` inconsistency is fixed — all upload-artifact uses are now `@v4` (SHA `ea165f8d…`). The `setup-node` split between v5 and v6 is also normalized to v6 throughout. `npm install` replaced with `npm ci` in all CI steps (co-fixes LOW-007). The `RELEASES_REPO_TOKEN` scope audit remains a manual step for the repository owner.

---

### MED-006 — `cliArgs` Elements Not Pattern-Validated Against `CLI_COMMAND_RE`
**Severity:** Medium
**Status:** Fixed
**Location:** `src/main/ipc/validate.ts`; `src/main/voices/CLIVoice.ts`
**Description:** `cliCommand` is validated against `CLI_COMMAND_RE` (`/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/`), but individual `cliArgs` elements are only checked to be non-empty strings up to 100 characters. Arguments containing spaces, `=` signs, or embedded flag patterns (e.g. `"--system-prompt injected-value"`) pass validation. Because `spawn()` is called without `shell: true`, shell metacharacter injection is not possible. However, argument injection (passing unintended flags to the CLI binary) is possible if the binary interprets unexpected characters in argument values.
**Recommendation:** Apply `CLI_COMMAND_RE` (or an explicitly documented, slightly broader pattern) to each element in `cliArgs`, or validate cliArgs elements against an allowlist that reflects the actual input constraints.
**Resolution:** Added `CLI_ARG_RE = /^[a-zA-Z0-9._/:@=,^%~+\-]+$/` to `validate.ts`. This pattern is intentionally broader than `CLI_COMMAND_RE` to accommodate common flag patterns (e.g. `--model=claude-opus-4-6`, `--timeout=30`, path-like values). Shell metacharacters (`;`, `&`, `` ` ``, `$`, `|`, `(`, `)`, `{`, `}`, `>`, `<`, `!`, newline, space) are all excluded. `requireCompositionVoiceShape` now applies `CLI_ARG_RE` to each element in `cliArgs` and throws if any element fails the pattern.

---

### HIGH-004 — Gemini API Key Sent as URL Query Parameter
**Severity:** High
**Status:** Fixed
**Location:** `src/main/ipc/settingsHandlers.ts` (Gemini `fetchModels` and `probeModel` calls)
**Description:** The Gemini API key is appended as a `?key=` URL query parameter when calling the Google Generative Language API. Query strings appear in HTTP access logs, proxy logs, network device logs, and server-side analytics. Although TLS protects the transport, the API key is materially more exposed than it would be in a request header.
**Recommendation:** Use the `x-goog-api-key` request header (or `Authorization: Bearer`) instead of the URL query parameter. The `@google/generative-ai` SDK supports header-based authentication via the `apiKey` constructor option.
**Resolution:** Both `fetchGeminiModels` and the Gemini branch of `probeModel` now pass the API key via the `x-goog-api-key` request header. The `?key=` query parameter has been removed from both URLs. The `GeminiVoice` provider was already using the `@google/generative-ai` SDK which authenticates via header internally and was unaffected.

---

### LOW-001 — E2E Test Mode Uses a Fixed All-Zero Encryption Key
**Severity:** Low
**Status:** Fixed
**Location:** `src/main/security/keyManager.ts` (`POLYPHON_E2E=1` branch)
**Description:** When `process.env.POLYPHON_E2E === '1'`, `initEncryption()` returns `Buffer.alloc(32)` — 32 zero bytes — as the database encryption key. If this flag were inadvertently set on a production machine (e.g. a misconfigured shell profile), all data would be encrypted with a fully-known key, allowing decryption without any credential.
**Recommendation:** Generate a random ephemeral key in E2E mode (`crypto.randomBytes(32)`) rather than all-zeros, so that accidental activation on a real data directory does not produce a known-key data set.
**Resolution:** `Buffer.alloc(32)` replaced with `randomBytes(32)`. Accidental activation on a real data directory now produces an ephemeral random key that is discarded when the app exits, rather than a predictable all-zeros key.

---

### LOW-002 — Avatar Data URI Allows `image/svg+xml` MIME Type
**Severity:** Low
**Status:** Fixed
**Location:** `src/main/ipc/validate.ts` (`IMAGE_DATA_URI_RE`)
**Description:** The avatar validation regex accepts any `data:image/*` MIME type, including `data:image/svg+xml`. SVG documents can embed JavaScript (`<svg onload="...">`). When loaded via `<img src>`, modern Electron rasterizes SVG images and does not execute embedded scripts; the production CSP further prevents data-URI script execution. However, defence-in-depth recommends rejecting SVG outright in user-supplied avatar fields.
**Recommendation:** Tighten `IMAGE_DATA_URI_RE` to an explicit MIME-type allowlist: `data:image/(png|jpeg|gif|webp|avif);base64,...`
**Resolution:** `IMAGE_DATA_URI_RE` now uses an explicit allowlist `(png|jpeg|gif|webp|avif)` instead of the wildcard `[a-zA-Z0-9.+-]+`. SVG and any other non-raster MIME type is rejected at validation time.

---

### LOW-003 — `provider_configs.cli_args` Not Assessed for Encryption Need
**Severity:** Low
**Status:** Fixed
**Location:** `src/main/db/schema.ts` (`provider_configs` table); `src/main/db/encryptionManifest.ts`
**Description:** The `provider_configs` table stores `cli_args` in plaintext and is not in the encryption manifest. While standard CLI argument names are not inherently sensitive, users may pass bearer tokens or credentials as CLI arguments — a common anti-pattern. The exclusion from the manifest is currently undocumented.
**Recommendation:** Audit whether `cli_args` in `provider_configs` can contain sensitive values. If so, add to `ENCRYPTED_FIELDS`. If not, add a comment to `encryptionManifest.ts` documenting the conscious exclusion.
**Resolution:** Audited and documented. `provider_configs.cli_args` stores standard CLI flags (e.g. `--model gpt-4o`) for built-in provider settings, not user-supplied content or credentials. A comment in `encryptionManifest.ts` documents this conscious exclusion and notes that user-facing `composition_voices.cli_args` (which can carry arbitrary content) is encrypted.

---

### LOW-004 — Copilot Passes Full Conversation Prompt as a CLI Argument
**Severity:** Low
**Status:** Fixed
**Location:** `src/main/voices/providers/copilot.ts`
**Description:** `spawn(cliCommand, [...cliArgs, '-p', prompt, '--allow-all-tools'])` passes the full conversation history as a positional CLI argument. Command-line arguments are visible in `/proc/<pid>/cmdline` on Linux and `ps aux` on macOS. The `claude-code` provider avoids this by writing to stdin instead.
**Recommendation:** Pass the prompt via stdin instead of as a `-p` argument. Most CLI tools that accept `-p <prompt>` also accept stdin input.
**Resolution:** Fixed alongside HIGH-003. The prompt is now written to `proc.stdin` and the `-p` argument is gone entirely.

---

### LOW-005 — Shell Env Delimiter Can Collide with Env Var Values
**Severity:** Low
**Status:** Fixed
**Location:** `src/main/utils/env.ts`
**Description:** `loadShellEnv()` wraps `env` output with the delimiter `_POLYPHON_ENV_DELIM_`. If an environment variable value contains this exact string, the delimiter split produces incorrect bounds and silently drops all subsequent variables (including API keys). This is an availability/reliability issue rather than a direct security bug.
**Recommendation:** Use `env -0` / `env --null` to produce NUL-separated output and parse on NUL boundaries, eliminating any possible collision.
**Resolution:** `loadShellEnv` now runs `command env -0` instead of the echo-delimiter approach. `spawnSync` uses `encoding: 'buffer'` (decoded as `latin1`) to preserve NUL bytes. A new `parseNulEnvBlock` function splits on `\0` (which cannot appear in POSIX env var values), making the parse immune to any delimiter-collision. `parseEnvBlock` is retained unchanged for backward compatibility with its existing tests.

---

### LOW-006 — API Error Response Body Forwarded to Renderer
**Severity:** Low
**Status:** Fixed
**Location:** `src/main/ipc/settingsHandlers.ts` (`probeModel` handler)
**Description:** `probeModel` returns the first 200 characters of a provider's HTTP error response body in the IPC response: `HTTP ${status}: ${body.slice(0, 200)}`. Provider error bodies generally contain only diagnostic text, but may occasionally include account-identifying strings or internal service details.
**Recommendation:** Return only the HTTP status code with a generic user-facing message; log the full error body to the main process only.
**Resolution:** The IPC error response now contains only `HTTP ${status}`. The full response body (up to 500 chars) is logged to `console.error` in the main process only and never crosses the IPC boundary.

---

### LOW-007 — `npm install` Used Instead of `npm ci` in CI
**Severity:** Low
**Status:** Fixed
**Location:** `.github/workflows/release.yml` (multiple build steps)
**Description:** Several CI steps use `npm install` rather than `npm ci`. `npm install` can silently update `package-lock.json` and resolve different transitive dependency versions, reducing build reproducibility. `npm ci` fails fast on lockfile inconsistency.
**Recommendation:** Replace all `npm install` with `npm ci` in CI workflows.
**Resolution:** All `npm install` calls in `release.yml` replaced with `npm ci` as part of the MED-005 rewrite.

---

### INFO-001 — No `npm audit` Step in CI
**Severity:** Informational
**Status:** Fixed
**Location:** `.github/workflows/release.yml`; `.github/workflows/deploy-site.yml`
**Description:** Neither workflow runs `npm audit`. The `overrides` in `package.json` address known transitive CVEs for `tmp`, `@tootallnate/once`, and `tar`, but new advisories would not be automatically surfaced.
**Recommendation:** Add `npm audit --audit-level=high` to the test job. Consider a non-blocking informational step on PRs.
**Resolution:** `npm audit --audit-level=high` added as a step to the `test` job in `release.yml`, running after `npm ci` and before lint. The build gates on high-severity vulnerabilities; moderate and below are non-blocking.

---

### INFO-002 — `decryptField` Silently Returns Plaintext for Non-Prefixed Values
**Severity:** Informational
**Location:** `src/main/security/fieldEncryption.ts`
**Description:** `decryptField()` returns the raw value when it does not start with `ENC:v1:`, enabling transparent migration from unencrypted legacy rows. This is intentional. However, corruption or deliberate prefix removal would cause ciphertext bytes to be silently returned as "plaintext" rather than raising an error.
**Recommendation:** Plan a future migration to require the prefix (error instead of passthrough) once all legacy unencrypted rows have been migrated. No immediate action.

---

### INFO-003 — Session Ownership Not Tied to BrowserWindow
**Severity:** Informational
**Location:** `src/main/ipc/index.ts` (`VOICE_SEND` handler)
**Description:** The `VOICE_SEND` handler validates the `sessionId` as a known UUID but does not verify the session belongs to the BrowserWindow that issued the IPC call. In the current single-window architecture this is not exploitable. Multi-window support would expose this assumption.
**Recommendation:** Document as an architectural assumption. Enforce per-window session ownership if multi-window support is added.

---

### INFO-004 — Update Checker Sends Application Version in User-Agent
**Severity:** Informational
**Location:** `src/main/utils/updateChecker.ts`
**Description:** The update check request to the GitHub releases API includes `User-Agent: polyphon/<version>`. This is standard practice per GitHub API documentation and allows network observers to determine the installed version. No action required.

---

### INFO-005 — No `dangerouslySetInnerHTML`, `eval`, `innerHTML`, or `document.write` in Renderer
**Severity:** Informational
**Location:** `src/renderer/` (exhaustive grep)
**Description:** Zero occurrences of `dangerouslySetInnerHTML`, `eval(`, `Function(`, `innerHTML`, `document.write`, or `insertAdjacentHTML` were found in the renderer source. All AI-generated message content is rendered via React text nodes. Version strings in `UpdateBanner` are interpolated as text. This is correct and should be maintained as an invariant in code review.

---

## What Was Done Well

**Electron Fuses are fully hardened.** `RunAsNode=false`, `EnableCookieEncryption=true`, `EnableNodeOptionsEnvironmentVariable=false`, `EnableNodeCliInspectArguments=false`, `EnableEmbeddedAsarIntegrityValidation=true`, `OnlyLoadAppFromAsar=true`. The full Fuses configuration is intentional and correct.

**Strong production CSP.** `default-src 'none'` with an explicit allow-list, `connect-src 'none'` (all API traffic is main-process-only via IPC), no `'unsafe-eval'` or `'unsafe-inline'` in production. The dual HTTP-header + `<meta>` tag mechanism correctly handles the Electron 41 `file://` vs HTTP distinction. The development policy scopes `connect-src` to the exact Vite dev server origin rather than a wildcard.

**Correct AES-256-GCM field encryption.** `crypto.randomBytes(12)` per encryption call (correct per-value random IV), GCM auth tags verified on decryption, atomic key file writes with `mode: 0o600`, verify-after-write step to detect filesystem errors.

**Typed `EncryptedField` brand enforces encryption discipline.** The branded type makes it a TypeScript compile error to assign plaintext to an encrypted column or use ciphertext where plaintext is expected. The manifest integration test (`encryption.manifest.integration.test.ts`) provides a CI gate that catches unencrypted writes to any manifest field.

**API keys never cross the IPC boundary in plaintext.** `resolveApiKeyStatus()` masks keys before sending to the renderer. `resolveApiKey()` is main-process-only. All reviewed handler return paths confirm no key leakage.

**No HTML injection sinks in the renderer.** All AI-generated content is rendered as plain text. No `dangerouslySetInnerHTML`, `eval`, or `innerHTML` usage found anywhere in the renderer tree.

**`shell:openExternal` is tightly allowlisted.** Only `polyphon.ai`, `github.com`, and `x.com` are permitted with explicit `https:` enforcement. Non-matching URLs are silently dropped.

**CLI subprocess hardening is correct.** All `spawn()` calls use an explicit args array without `shell: true`, preventing shell metacharacter injection. `requireCliCommand` regex restricts command names. `spawnSync` timeout and `maxBuffer` limits prevent runaway processes in `testCliVoice`.

**`loadShellEnv` is hardened.** Key format filtering, per-key and per-value length caps, total env size cap, and key count cap are all present.

**Update checker validates version strings strictly.** `parseReleaseVersion()` applies `/^\d+\.\d+\.\d+$/` before any downstream use. Draft and prerelease flags are checked.

**Key management uses OS keychain integration.** `safeStorage` (Keychain/libsecret/DPAPI) is the primary key-wrapping mechanism. The scrypt-based password fallback is used only when safeStorage is unavailable. Key material is held in `Buffer` to limit GC exposure.

**Parameterized SQL throughout.** All database queries use `db.prepare()` with bound parameters. No string-concatenated SQL found anywhere. SQL injection via the IPC layer is not possible.

---

## Recommended Sprint Priorities

| Priority | Finding | Effort |
|---|---|---|
| 1 | CRIT-001 — Linux AppImage disables renderer sandbox | Medium |
| 2 | HIGH-001 — Add explicit `setWindowOpenHandler` deny + `will-navigate` block | Low |
| 3 | HIGH-003 — Remove `--allow-all-tools` from Copilot default invocation | Low |
| 4 | HIGH-004 — Move Gemini API key from URL query param to request header | Low |
| 5 | MED-005 — Pin GitHub Actions to commit SHAs; fix `upload-artifact` version | Low |
| 6 | MED-002 — Encrypt `conductor_avatar` in `user_profile` | Low |
| 7 | MED-006 — Apply `CLI_COMMAND_RE` validation to `cliArgs` elements | Low |
| 8 | MED-003 — Increase scrypt `N` to 65536+ | Low |
| 9 | HIGH-002 — Add private-IP blocklist to `requireUrl` for custom provider URLs | Medium |
| 10 | LOW-004 — Copilot: pass prompt via stdin instead of `-p` CLI arg | Low |
| 11 | LOW-002 — Tighten avatar MIME-type allowlist (exclude SVG) | Low |
| 12 | LOW-007 — Replace `npm install` with `npm ci` in CI | Low |

---

## Appendix: Files Reviewed

### Main Process
- `src/main/index.ts`
- `src/main/preload.ts`
- `src/main/security/csp.ts`
- `src/main/security/fieldEncryption.ts`
- `src/main/security/keyManager.ts`
- `src/main/security/unlockWindow.ts`
- `src/main/ipc/index.ts`
- `src/main/ipc/settingsHandlers.ts`
- `src/main/ipc/validate.ts`
- `src/main/db/schema.ts`
- `src/main/db/encryptionManifest.ts`
- `src/main/db/queries/messages.ts`
- `src/main/db/queries/userProfile.ts`
- `src/main/db/queries/customProviders.ts`
- `src/main/db/queries/providerConfigs.ts`
- `src/main/db/queries/sessions.ts`
- `src/main/db/queries/compositions.ts`
- `src/main/db/queries/tones.ts`
- `src/main/db/queries/systemPromptTemplates.ts`
- `src/main/voices/Voice.ts`
- `src/main/voices/APIVoice.ts`
- `src/main/voices/CLIVoice.ts`
- `src/main/voices/MockVoice.ts`
- `src/main/voices/providers/anthropic.ts`
- `src/main/voices/providers/openai.ts`
- `src/main/voices/providers/gemini.ts`
- `src/main/voices/providers/openai-compat.ts`
- `src/main/voices/providers/claude-code.ts`
- `src/main/voices/providers/copilot.ts`
- `src/main/managers/VoiceManager.ts`
- `src/main/managers/SessionManager.ts`
- `src/main/utils/env.ts`
- `src/main/utils/updateChecker.ts`

### Renderer
- `src/renderer/components/Session/MessageBubble.tsx`
- `src/renderer/components/Session/ConductorPanel.tsx`
- `src/renderer/components/Settings/AvatarEditor.tsx`
- `src/renderer/components/Settings/EncryptionSection.tsx`
- `src/renderer/components/Shared/UpdateBanner.tsx`
- `src/renderer/components/PasswordPrompt/PasswordPromptView.tsx`
- `src/renderer/` — grep scan for `dangerouslySetInnerHTML`, `eval(`, `innerHTML`, `document.write`, `insertAdjacentHTML`

### Shared
- `src/shared/types.ts`
- `src/shared/constants.ts`

### Project Configuration
- `forge.config.ts`
- `package.json`

### CI/CD
- `.github/workflows/release.yml`
- `.github/workflows/deploy-site.yml`

---
**Sprint 015 update (2026-03-19):** `parseEnvBlock()` was removed. The production env-loading
path was always `parseNulEnvBlock()` exclusively. The edge-case test coverage previously
anchored to `parseEnvBlock` was migrated to the `parseNulEnvBlock` test suite.
