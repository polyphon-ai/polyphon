# Polyphon Security Review

**Date:** 2026-03-17
**Reviewer:** Claude Code
**Codebase state:** `8b0c039e0266a9e3c15c0336c69c0543e2ba461e`
**Scope:** Full static review of `src/`, `forge.config.ts`, `package.json`, `.github/`

---

## Executive Summary

Polyphon’s baseline Electron hardening is strong. The main window runs with `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`, `webSecurity: true`, popup creation is denied, renderer-initiated navigation is blocked, the preload surface is explicit, and the Electron Fuses configuration is appropriately restrictive. The renderer also avoids the usual high-risk DOM sinks: I did not find any use of `dangerouslySetInnerHTML`, `eval`, `Function`, `innerHTML`, `document.write`, or `insertAdjacentHTML` anywhere under `src/`.

The most important remaining risks are around outbound network trust boundaries and data minimization. Custom OpenAI-compatible provider URLs are only partially protected against SSRF, substantial user metadata remains plaintext even when field encryption is enabled, and one IPC handler still persists unvalidated fields. I also found that the update checker points at a malformed GitHub Releases URL, which weakens security patch uptake by silently disabling release notifications.

Overall, this is a solid security foundation for a local-first Electron app, with most of the hard problems addressed thoughtfully. The next sprint should focus on tightening custom-provider network controls, expanding or documenting encryption scope, and closing the remaining validation and supply-chain gaps.

---

## Findings

### HIGH-001 — Custom provider SSRF protections are incomplete
**Severity:** High
**Location:** `src/main/ipc/validate.ts:117`, `src/main/ipc/validate.ts:151`, `src/main/ipc/settingsHandlers.ts:283`
**Description:** `requireExternalUrl()` blocks literal RFC1918, link-local, and `.local` destinations, but it intentionally allows loopback targets such as `localhost`, `127.0.0.1`, and `::1`, and it does not resolve hostnames before approval. It also validates only the originally stored URL; `fetch()` may still follow redirects to internal addresses. That means a compromised renderer, malicious local state, or a socially engineered custom provider configuration can cause the app to probe local services or internal hosts from the user’s machine. In the custom-provider path, an attacker-controlled endpoint can also receive the configured bearer token by design.
**Recommendation:** Treat custom-provider networking as an explicit trust boundary. Resolve hostnames before allowlisting, block redirects by default or re-validate every redirect target, and split “allow localhost” into an explicit opt-in for known local model runtimes instead of allowing loopback globally.

### MED-001 — Field encryption leaves significant user metadata in plaintext
**Severity:** Medium
**Location:** `src/main/db/encryptionManifest.ts:7`, `src/main/db/schema.ts:6`, `src/main/db/schema.ts:35`, `src/main/db/schema.ts:57`, `src/main/db/schema.ts:72`, `src/main/db/schema.ts:85`, `src/main/db/schema.ts:95`
**Description:** The encryption manifest correctly covers message bodies, conductor profile secrets, custom provider base URLs, system prompt template content, and per-voice prompts/CLI args. However, many user-authored or privacy-relevant fields remain plaintext in SQLite: composition names, session names, voice display names, custom provider names/slugs/default models, template names, tone names/descriptions, and provider configuration fields. This does not expose API keys, but it does expose conversation metadata and personal labeling even when database encryption is otherwise enabled.
**Recommendation:** Expand the manifest to cover user-authored metadata that reveals activity or identity, or clearly document that current encryption protects message bodies and select sensitive fields only, not full application metadata.

### MED-002 — `settings:saveProviderConfig` accepts unvalidated fields
**Severity:** Medium
**Location:** `src/main/ipc/settingsHandlers.ts:324`
**Description:** The handler validates `voiceType`, `enabled`, `defaultModel`, and `cliCommand`, but it does not validate `provider` against an allowlist and does not validate `cliArgs` at all before persisting it. Today that field is not fed directly into a subprocess invocation, so this is not an immediate command-injection bug, but it breaks the stated invariant that renderer-supplied IPC inputs go through the validation layer before being trusted or stored.
**Recommendation:** Validate `provider` with a concrete allowlist, add length/shape validation for `cliArgs`, and reuse the same CLI argument policy used for composition voices if this field is intended for future execution.

### MED-003 — Update notifications are effectively disabled, weakening patch uptake
**Severity:** Medium
**Location:** `src/main/utils/updateChecker.ts:21`, `src/main/utils/updateChecker.ts:45`, `src/main/utils/updateChecker.ts:77`
**Description:** The release endpoint is malformed: `https://api.github.com/repos/polyphon-ai/releases/releases/latest` duplicates `/releases/` and will return a failure instead of the latest Polyphon release. Because failures are silently ignored, users will not be notified about new releases, including security fixes. The fetches also have no timeout or abort signal, so a stalled network request can hang indefinitely.
**Recommendation:** Change the endpoint to the project’s actual releases API path, add a short timeout via `AbortController`, and add a test that asserts the exact release URL and a successful parse path.

### LOW-001 — `probeModel` logs provider error bodies to the main-process console
**Severity:** Low
**Location:** `src/main/ipc/settingsHandlers.ts:256`
**Description:** On probe failure, the handler deliberately suppresses provider details to the renderer, which is good, but it still logs up to 500 characters of the response body to stdout/stderr. Provider error bodies can contain account identifiers, request echoes, or other tenant-specific details that do not belong in desktop app logs.
**Recommendation:** Log only status codes and a short provider label by default. If deeper diagnostics are needed, gate body logging behind an explicit debug mode and redact obvious secrets or identifiers first.

### LOW-002 — A vulnerable `next` version is present through `geist`, and CI will not fail on it
**Severity:** Low
**Location:** `package.json:58`, `.github/workflows/release.yml:28`
**Description:** Runtime dependency `geist@^1.7.0` pulls in `next@16.1.6`. `npm audit --omit=dev --json` currently reports a moderate vulnerability against that `next` version range, and the release workflow only fails on `high` or worse findings. This does not look directly exploitable in the Electron runtime as used here, but it is still a shipped dependency with a known advisory.
**Recommendation:** Override or update `next` to a fixed version if `geist` permits it, or replace the dependency if not. Lower the CI audit threshold to at least `moderate`, or add an explicit allowlist process so this kind of gap is visible and intentional.

### INFO-001 — Renderer content is rendered safely without unsafe HTML sinks
**Severity:** Informational
**Location:** `src/renderer/components/Session/MessageBubble.tsx:47`, `src/renderer/components/Settings/AvatarEditor.tsx:20`, `src/renderer/components/Shared/UpdateBanner.tsx:46`
**Description:** AI-generated message content is rendered as plain React text, not via HTML injection. Avatars are restricted to raster image data URIs by validation, then rendered through `<img src=...>`. Update version strings are interpolated as text content. I also did not find any use of `dangerouslySetInnerHTML`, `eval`, `Function`, `innerHTML`, `document.write`, or `insertAdjacentHTML` anywhere in `src/`.
**Recommendation:** Keep the current “text-only by default” rule in place, and require an explicit sanitizer review before introducing any markdown-with-HTML or raw HTML rendering path.

---

## What Was Done Well

- `BrowserWindow` hardening is correctly set in the main process: `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`, `webSecurity: true`, popup denial, and navigation blocking are all present in [`src/main/index.ts`](/Users/corey/Code/github.com/polyphon-ai/polyphon/src/main/index.ts#L30).
- Electron Fuses are strong and appropriately restrictive in [`forge.config.ts`](/Users/corey/Code/github.com/polyphon-ai/polyphon/forge.config.ts#L75): `RunAsNode` is off, `NODE_OPTIONS` and CLI inspect arguments are disabled, ASAR integrity validation is on, and the app is forced to load from ASAR.
- The preload layer is explicit and does not expose `ipcRenderer` directly; the renderer only gets a curated API surface from [`src/main/preload.ts`](/Users/corey/Code/github.com/polyphon-ai/polyphon/src/main/preload.ts#L19).
- AES-256-GCM is implemented with random 96-bit IVs and auth tags in [`src/main/security/fieldEncryption.ts`](/Users/corey/Code/github.com/polyphon-ai/polyphon/src/main/security/fieldEncryption.ts#L20), and password wrapping uses scrypt with a materially stronger parameter than the legacy fallback in [`src/main/security/keyManager.ts`](/Users/corey/Code/github.com/polyphon-ai/polyphon/src/main/security/keyManager.ts#L41).
- API keys stay in the main process and are masked before any IPC response in [`src/main/utils/env.ts`](/Users/corey/Code/github.com/polyphon-ai/polyphon/src/main/utils/env.ts#L174) and [`src/main/ipc/settingsHandlers.ts`](/Users/corey/Code/github.com/polyphon-ai/polyphon/src/main/ipc/settingsHandlers.ts#L56).
- The renderer avoids the classic DOM XSS sinks entirely, and message/update/avatar rendering is text or data-URI based rather than raw HTML.
- GitHub Actions are pinned to commit SHAs throughout the reviewed workflows, which is the right supply-chain posture.

---

## Recommended Sprint Priorities

| Priority | Finding | Effort |
|---|---|---|
| 1 | HIGH-001 — Custom provider SSRF protections are incomplete | Medium |
| 2 | MED-001 — Field encryption leaves significant user metadata in plaintext | Medium |
| 3 | MED-003 — Update notifications are effectively disabled, weakening patch uptake | Low |
| 4 | MED-002 — `settings:saveProviderConfig` accepts unvalidated fields | Low |
| 5 | LOW-002 — A vulnerable `next` version is present through `geist`, and CI will not fail on it | Low |
| 6 | LOW-001 — `probeModel` logs provider error bodies to the main-process console | Low |

---

## Appendix: Files Reviewed

- `forge.config.ts`
- `package.json`
- `.github/workflows/deploy-site.yml`
- `.github/workflows/release.yml`
- `src/main/db/encryption.manifest.integration.test.ts`
- `src/main/db/encryption.ts`
- `src/main/db/encryptionManifest.ts`
- `src/main/db/index.ts`
- `src/main/db/migrations/002_add_update_preferences.ts`
- `src/main/db/migrations/003_encrypt_conductor_avatar.ts`
- `src/main/db/migrations/index.ts`
- `src/main/db/migrations/migrations.integration.test.ts`
- `src/main/db/queries/compositions.integration.test.ts`
- `src/main/db/queries/compositions.ts`
- `src/main/db/queries/customProviders.integration.test.ts`
- `src/main/db/queries/customProviders.ts`
- `src/main/db/queries/messages.integration.test.ts`
- `src/main/db/queries/messages.ts`
- `src/main/db/queries/providerConfigs.ts`
- `src/main/db/queries/sessions.integration.test.ts`
- `src/main/db/queries/sessions.ts`
- `src/main/db/queries/systemPromptTemplates.integration.test.ts`
- `src/main/db/queries/systemPromptTemplates.ts`
- `src/main/db/queries/tones.integration.test.ts`
- `src/main/db/queries/tones.ts`
- `src/main/db/queries/userProfile.integration.test.ts`
- `src/main/db/queries/userProfile.ts`
- `src/main/db/schema.ts`
- `src/main/electron-squirrel-startup.d.ts`
- `src/main/index.ts`
- `src/main/ipc/handlers.integration.test.ts`
- `src/main/ipc/index.ts`
- `src/main/ipc/sessionHandlers.integration.test.ts`
- `src/main/ipc/settingsHandlers.integration.test.ts`
- `src/main/ipc/settingsHandlers.models.integration.test.ts`
- `src/main/ipc/settingsHandlers.test.ts`
- `src/main/ipc/settingsHandlers.ts`
- `src/main/ipc/validate.test.ts`
- `src/main/ipc/validate.ts`
- `src/main/managers/SessionManager.test.ts`
- `src/main/managers/SessionManager.ts`
- `src/main/managers/VoiceManager.ts`
- `src/main/preload.ts`
- `src/main/security/csp.test.ts`
- `src/main/security/csp.ts`
- `src/main/security/fieldEncryption.test.ts`
- `src/main/security/fieldEncryption.ts`
- `src/main/security/keyManager.test.ts`
- `src/main/security/keyManager.ts`
- `src/main/security/unlockWindow.ts`
- `src/main/utils/env.test.ts`
- `src/main/utils/env.ts`
- `src/main/utils/index.ts`
- `src/main/utils/updateChecker.test.ts`
- `src/main/utils/updateChecker.ts`
- `src/main/utils/version.test.ts`
- `src/main/utils/version.ts`
- `src/main/voices/APIVoice.ts`
- `src/main/voices/CLIVoice.ts`
- `src/main/voices/MockVoice.ts`
- `src/main/voices/Voice.ts`
- `src/main/voices/providers/anthropic.test.ts`
- `src/main/voices/providers/anthropic.ts`
- `src/main/voices/providers/claude-code.test.ts`
- `src/main/voices/providers/claude-code.ts`
- `src/main/voices/providers/copilot.test.ts`
- `src/main/voices/providers/copilot.ts`
- `src/main/voices/providers/gemini.test.ts`
- `src/main/voices/providers/gemini.ts`
- `src/main/voices/providers/openai-compat.test.ts`
- `src/main/voices/providers/openai-compat.ts`
- `src/main/voices/providers/openai.test.ts`
- `src/main/voices/providers/openai.ts`
- `src/renderer/App.test.tsx`
- `src/renderer/App.tsx`
- `src/renderer/components/Composition/CompositionBuilder.test.tsx`
- `src/renderer/components/Composition/CompositionBuilder.tsx`
- `src/renderer/components/Composition/VoiceOrderList.tsx`
- `src/renderer/components/Composition/VoiceSelector.test.tsx`
- `src/renderer/components/Composition/VoiceSelector.tsx`
- `src/renderer/components/PasswordPrompt/PasswordPromptView.tsx`
- `src/renderer/components/Session/ConductorInput.test.tsx`
- `src/renderer/components/Session/ConductorInput.tsx`
- `src/renderer/components/Session/ConductorPanel.tsx`
- `src/renderer/components/Session/MessageBubble.tsx`
- `src/renderer/components/Session/MessageFeed.test.tsx`
- `src/renderer/components/Session/MessageFeed.tsx`
- `src/renderer/components/Session/SessionView.test.tsx`
- `src/renderer/components/Session/SessionView.tsx`
- `src/renderer/components/Session/VoicePanel.tsx`
- `src/renderer/components/Settings/AboutPage.test.tsx`
- `src/renderer/components/Settings/AboutPage.tsx`
- `src/renderer/components/Settings/AvatarEditor.tsx`
- `src/renderer/components/Settings/EncryptionSection.tsx`
- `src/renderer/components/Settings/SettingsPage.tsx`
- `src/renderer/components/Shared/HelpTooltip.tsx`
- `src/renderer/components/Shared/ProviderLogo.tsx`
- `src/renderer/components/Shared/UpdateBanner.test.tsx`
- `src/renderer/components/Shared/UpdateBanner.tsx`
- `src/renderer/components/Shared/index.ts`
- `src/renderer/hooks/index.ts`
- `src/renderer/index.css`
- `src/renderer/index.tsx`
- `src/renderer/polyphon.d.ts`
- `src/renderer/store/compositionStore.test.ts`
- `src/renderer/store/compositionStore.ts`
- `src/renderer/store/sessionStore.test.ts`
- `src/renderer/store/sessionStore.ts`
- `src/renderer/store/settingsStore.test.ts`
- `src/renderer/store/settingsStore.ts`
- `src/renderer/store/uiStore.test.ts`
- `src/renderer/store/uiStore.ts`
- `src/renderer/utils/index.ts`
- `src/renderer/vite-env.d.ts`
- `src/shared/constants.ts`
- `src/shared/types.ts`
