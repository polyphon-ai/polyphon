# Sprint 004: At-Rest Database Encryption

## Overview

Polyphon stores sensitive data — message bodies, conductor profile, custom provider URLs, system prompt templates, and composition voice configurations — in a local SQLite database with no encryption. A user who loses their device or has their disk imaged exposes all of that data in plaintext.

This sprint adds transparent, field-level AES-256-GCM encryption at the query layer with no required user action.

**Layer 1 (automatic):** On first run, a 256-bit database key is generated and wrapped with `electron.safeStorage` — macOS Keychain, Windows DPAPI, or libsecret on Linux (falls back to basic text storage if libsecret is not installed; see Linux notice). Silent, zero friction. All new sensitive field writes are encrypted from first launch.

**Layer 2 (optional):** Users can set a password in Settings → Encryption. The password is used with `scryptSync` (N=16384, r=8, p=1) to derive a wrapping key that replaces safeStorage wrapping. On subsequent startups, a password window appears before the main window. Changing the password re-wraps the existing DB key — the key itself never changes, so existing encrypted rows remain readable throughout.

The DB key is persisted in `polyphon.key.json` alongside `polyphon.db`. Existing plaintext rows continue to load correctly: `decryptField` returns the raw value when the input does not begin with the `ENC:v1:` sentinel. If a field begins with `ENC:v1:` but decryption fails (wrong key, corruption), `decryptField` returns the exported `DECRYPTION_FAILED_SENTINEL` constant — never raw ciphertext, never silent empty string. UI components check for this sentinel and render a `[Message unavailable]` placeholder.

---

## Use Cases

1. **Default-safe** — new installs get silent encryption with no user action; all new sensitive writes are encrypted at rest from day one
2. **Plaintext migration** — existing users upgrade; old plaintext rows load normally via fallback; new writes are encrypted
3. **Password-protected** — security-conscious users add a password in Settings; app requires it on every startup
4. **Password lifecycle** — user changes or removes their password; the DB key never changes; existing data remains accessible throughout
5. **Linux notice** — Linux users with a weak safeStorage backend (`basic_text`) and no password set see a one-time recommendation
6. **E2E continuity** — all existing e2e tests pass unchanged with `POLYPHON_E2E=1`

---

## Architecture

```
app.whenReady() — async, main process
  ├── loadShellEnv()
  ├── await loadOrCreateKey(userDataPath, safeStorage, e2e)
  │     ├── POLYPHON_E2E=1 → return Buffer.alloc(32)  [fixed test key; skip all OS calls]
  │     ├── polyphon.key.json missing:
  │     │     → randomBytes(32) → wrapWithSafeStorage() → writeKeyFileAtomic()
  │     │     → flag: keyWasRegenerated = true  [shown as warning after main window opens]
  │     ├── polyphon.key.json wrapping="safeStorage":
  │     │     → safeStorage.decryptString(encryptedKey) → return key
  │     │     → if safeStorage fails: show fatal error dialog, quit
  │     └── polyphon.key.json wrapping="password":
  │           → createUnlockWindow()  [small BrowserWindow, ?view=unlock]
  │           → await unlockPromise   [resolved by encryption:unlock-attempt IPC]
  │           → scryptSync(password, salt, 32) → AES-GCM unwrap → return key
  │           → wrong password: send error to unlock window; user retries
  ├── initFieldEncryption(key)          [sets module-level key singleton]
  ├── getDb()                           [opens SQLite + runMigrations]
  ├── voiceManager.loadCustomProviders(db)   [reads encrypted base_url]
  ├── voiceManager.loadTones(db)
  ├── voiceManager.loadSystemPromptTemplates(db)   [reads encrypted content]
  ├── registerIpcHandlers(db, ...)
  ├── createMainWindow()
  │     → if unlockWindow existed: close it first, then open main window
  └── checkForUpdate(db, win)
      After win.show():
        if !e2e && safeStorage.isEncryptionAvailable()
             && safeStorage.getSelectedStorageBackend?.() === 'basic_text'
             && keyFile.wrapping === 'safeStorage'
             && !keyFile.linuxNoticeDismissed
          → win.webContents.send(IPC.ENCRYPTION_LINUX_NOTICE)

Field encryption (main process only):
  encryptField(value: string): string
    → AES-256-GCM, randomBytes(12) IV
    → returns "ENC:v1:<base64(iv[12] + ciphertext + authTag[16])>"

  export const DECRYPTION_FAILED_SENTINEL = '\u0000[decryption-failed]\u0000'
  // Null-byte delimiters make this impossible to appear in user-generated content.

  decryptField(value: string | null): string | null
    → null/undefined input → return null
    → does not start with "ENC:v1:" → return raw value  [legacy plaintext compat]
    → starts with "ENC:v1:" but decrypt fails → console.error (dev only) + return DECRYPTION_FAILED_SENTINEL
    → starts with "ENC:v1:" and decrypt succeeds → return plaintext

  Callers (query row-mapping functions) pass DECRYPTION_FAILED_SENTINEL up unchanged.
  UI components (MessageBubble, etc.) detect DECRYPTION_FAILED_SENTINEL and render "[Message unavailable]".

Key file format — polyphon.key.json:
  {
    "version": 1,
    "wrapping": "safeStorage",
    "encryptedKey": "<base64>",
    "linuxNoticeDismissed": false
  }
  OR
  {
    "version": 1,
    "wrapping": "password",
    "salt": "<32-byte hex>",
    "iv": "<12-byte hex>",
    "ciphertext": "<32-byte hex>",
    "authTag": "<16-byte hex>",
    "linuxNoticeDismissed": false
  }

Settings UI (renderer):
  Settings → Encryption section
    ├── status: "Protected by system keychain" | "Password-protected"
    ├── Linux basic_text inline warning (when applicable)
    ├── set / change / remove password forms
    └── irrecoverability copy: "Forgetting your password means your data cannot be recovered."

IPC — settings:encryption namespace:
  settings:encryption:getStatus     → EncryptionStatus
  settings:encryption:setPassword   { newPassword }
  settings:encryption:changePassword { oldPassword, newPassword }
  settings:encryption:removePassword { currentPassword }
  settings:encryption:dismissLinuxNotice
  settings:encryption:unlock-attempt { password }  →  { ok: boolean, error?: string }
  (push) settings:encryption:linux-notice
```

---

## Implementation Plan

### P0: Must Ship

#### 1. Crypto foundation — `src/main/security/`

**Files:**
- `src/main/security/fieldEncryption.ts`
- `src/main/security/fieldEncryption.test.ts`
- `src/main/security/keyManager.ts`
- `src/main/security/keyManager.test.ts`

**Tasks:**
- [ ] `initFieldEncryption(key: Buffer): void` — sets module-level key; throws if called twice without reset (in non-test code)
- [ ] `resetFieldEncryption(): void` — test helper only; exported but name-prefixed as `_resetForTests`
- [ ] `encryptField(value: string): string` — AES-256-GCM with `randomBytes(12)` IV; throws if not initialized; returns `"ENC:v1:<base64(iv[12] + ciphertext + authTag[16])>"`
- [ ] Export `DECRYPTION_FAILED_SENTINEL = '\u0000[decryption-failed]\u0000'` from `fieldEncryption.ts`
- [ ] `decryptField(value: string | null): string | null`:
  - `null` → `null`
  - no `"ENC:v1:"` prefix → return raw value (legacy plaintext compat)
  - `"ENC:v1:"` prefix, decrypt fails → `console.error('[security] decryptField failed: …')` (dev only) + return `DECRYPTION_FAILED_SENTINEL`
  - `"ENC:v1:"` prefix, decrypt succeeds → return plaintext
- [ ] Unit tests: encrypt→decrypt round-trip; null input; plaintext input falls back; "ENC:v1:" prefix with wrong key returns `DECRYPTION_FAILED_SENTINEL`; "ENC:v1:" prefix with tampered authTag returns `DECRYPTION_FAILED_SENTINEL`
- [ ] `generateDbKey(): Buffer` — `randomBytes(32)`
- [ ] `wrapWithSafeStorage(key: Buffer, safeStorage): string` — `safeStorage.encryptString(key.hex)` → base64
- [ ] `unwrapWithSafeStorage(b64: string, safeStorage): Buffer` — inverse; throws on failure
- [ ] `wrapWithPassword(key: Buffer, password: string): { salt: string, iv: string, ciphertext: string, authTag: string }` — `randomBytes(32)` salt; `scryptSync(password, salt, 32, { N: 16384, r: 8, p: 1 })` wrapping key; AES-256-GCM encrypt DB key
- [ ] `unwrapWithPassword(data, password): Buffer` — inverse; throws on wrong password (GCM auth failure)
- [ ] `readKeyFile(path): KeyFile | null` — read + JSON.parse; return null if file missing; throw on parse error
- [ ] `writeKeyFileAtomic(path, file): void` — write to `path + '.tmp'` then `fs.renameSync` to `path`
- [ ] `loadOrCreateKey(userDataPath, safeStorage, e2e): { key: Buffer, keyWasRegenerated: boolean }` (sync for safeStorage path; async/Promise for password path — call from async context):
  - `e2e === true` → return `{ key: Buffer.alloc(32), keyWasRegenerated: false }`
  - key file missing → generate key, wrap with safeStorage, write atomic, return `{ key, keyWasRegenerated: false }` (first run — no regeneration warning)
  - key file `wrapping: 'safeStorage'` → unwrap; if fails show fatal dialog + quit
  - key file `wrapping: 'password'` → return a Promise (resolved by IPC unlock event)
  - NOTE: there is no automatic detection of "key file regenerated on non-first-run" at startup since we cannot distinguish first-run from "key file deleted" without inspecting the DB. A key file deletion warning is shown after startup if the key file was absent but the `schema_version` row already existed (indicating a non-first-run install).
- [ ] `updateKeyWrapping(userDataPath, newFile): void` — atomic write; used by set/change/remove password handlers; **after writing, immediately re-reads and verifies the new key file can be unwrapped (verify-after-write)**; throws if verification fails (leaves old key file untouched via atomic rename)
- [ ] Unit tests: safeStorage round-trip; password round-trip; wrong password throws; key file read/write/atomic; e2e path; missing file creates new key

#### 2. Startup wiring — `src/main/index.ts`

**Tasks:**
- [ ] Make `app.whenReady()` callback: call `loadOrCreateKey(app.getPath('userData'), safeStorage, process.env.POLYPHON_E2E === '1')` at the top, before `getDb()`; await if it returns a Promise (password mode)
- [ ] `initFieldEncryption(key)` immediately after key is available
- [ ] `getDb()` called after encryption is initialized
- [ ] For password mode: `loadOrCreateKey` creates the unlock window and returns a Promise resolved by `settings:encryption:unlock-attempt` IPC; after resolution, close the unlock window and open the main window normally
- [ ] For `POLYPHON_E2E=1`: `loadOrCreateKey` returns `Buffer.alloc(32)` synchronously; no windows created, no OS calls; rest of startup unchanged
- [ ] After `win.show()`: if not e2e, `safeStorage.isEncryptionAvailable()`, `getSelectedStorageBackend?.() === 'basic_text'`, and key file has `wrapping: 'safeStorage'` and `!linuxNoticeDismissed` → `win.webContents.send(IPC.ENCRYPTION_LINUX_NOTICE)`
- [ ] After `win.show()`: if `keyFileWasAbsent && schemaVersionRowExists` (non-first-run, key file missing) → `win.webContents.send(IPC.ENCRYPTION_KEY_REGENERATED_WARNING)` so the renderer can show: "Encryption key not found. A new key has been generated. Previously encrypted data cannot be recovered."

#### 3. Unlock window — `src/main/security/unlockWindow.ts`

**Tasks:**
- [ ] `createUnlockWindow(rendererUrl: string): { window: BrowserWindow, unlockPromise: Promise<Buffer> }` — `BrowserWindow({ width: 400, height: 300, resizable: false, center: true, frame: true })`; loads `rendererUrl + '?view=unlock'`; the returned promise resolves when `settings:encryption:unlock-attempt` succeeds
- [ ] IPC `settings:encryption:unlock-attempt { password }`:
  - call `unwrapWithPassword(keyFile, password)`
  - success → store key in-process, resolve the promise → main closes unlock window → main opens main window; reply `{ ok: true }`
  - failure → reply `{ ok: false, error: 'Incorrect password' }`
  - after N≥5 consecutive wrong attempts: reply includes `{ ok: false, error: '…', cooldown: true }` (P1)

#### 4. Password prompt renderer — `src/renderer/components/PasswordPrompt/PasswordPromptView.tsx` + `App.tsx`

**Tasks:**
- [ ] `App.tsx`: if `new URLSearchParams(window.location.search).get('view') === 'unlock'`, render `<PasswordPromptView />` as the entire view (no layout, no sidebar)
- [ ] `<PasswordPromptView />`: Polyphon logo/name, password input (type=password), Submit button, error message area, "Quit Polyphon" button (calls `window.polyphon.app.quit()` or equivalent)
- [ ] On submit: call `window.polyphon.encryption.unlockAttempt(password)` → if `{ ok: true }`: show brief "Unlocking…" state (main window opens soon, this window will close); if `{ ok: false }`: show error, clear input, re-focus
- [ ] Preload: expose `window.polyphon.encryption.unlockAttempt(password: string): Promise<{ ok: boolean, error?: string }>`
- [ ] Unit tests: renders when `?view=unlock`; submit calls IPC; error message shown on failure; quit button present

#### 5. Fix `upsertUserProfile` INSERT OR REPLACE bug — `src/main/db/queries/userProfile.ts`

**Tasks:**
- [ ] Change `upsertUserProfile` from `INSERT OR REPLACE` to explicit `UPDATE user_profile SET conductor_name=?, pronouns=?, conductor_context=?, default_tone=?, conductor_color=?, conductor_avatar=?, updated_at=? WHERE id=1`
- [ ] (The `INSERT OR IGNORE` in `runMigrations` already ensures the row exists; `UPDATE` is safe)
- [ ] Existing integration tests must still pass after this change

#### 6. Query-layer encryption

**Tasks:**

`src/main/db/queries/messages.ts`:
- [ ] `insertMessage`: `encryptField(message.content)` before write
- [ ] `rowToMessage`: `decryptField(row.content)` in output

`src/main/db/queries/userProfile.ts`:
- [ ] `upsertUserProfile` (after INSERT OR REPLACE fix): encrypt `conductor_name`, `pronouns`, `conductor_context` before write
- [ ] `rowToProfile`: decrypt those three fields

`src/main/db/queries/customProviders.ts`:
- [ ] insert/update functions: encrypt `base_url` before write
- [ ] row-to-domain mapping: `decryptField(row.base_url)`

`src/main/db/queries/systemPromptTemplates.ts`:
- [ ] insert/update: encrypt `content` before write
- [ ] row mapping: `decryptField(row.content)`

`src/main/db/queries/compositions.ts`:
- [ ] `upsertCompositionVoices`: encrypt `system_prompt` (nullable — pass through `encryptField` only if non-null) and `cli_args` (serialize to JSON string first, then encrypt; encrypt the serialized string, not the array) before each row write
- [ ] voice row mapping: `decryptField(row.system_prompt)` and `decryptField(row.cli_args)` (decrypt first, then `JSON.parse` for cli_args)

**Integration tests** (one per modified query file):
- [ ] Each file: `initFieldEncryption(Buffer.alloc(32))` in test setup; write a record; confirm raw SQL `SELECT … FROM … WHERE id=?` returns an `ENC:v1:` prefixed value; confirm the query helper returns the decrypted original value
- [ ] At least one test per file: write an old-style plaintext row directly via raw SQL; confirm the query helper reads it back correctly (plaintext fallback)

#### 7. Encryption IPC and Settings UI

**Files:**
- `src/shared/constants.ts`
- `src/shared/types.ts`
- `src/main/ipc/settingsHandlers.ts`
- `src/main/preload.ts`
- `src/renderer/components/Settings/EncryptionSection.tsx`
- `src/renderer/components/Settings/SettingsPage.tsx`
- `src/renderer/App.tsx` (Linux notice subscription)

**Tasks:**
- [ ] Add to `src/shared/constants.ts` under `IPC`:
  ```
  ENCRYPTION_GET_STATUS: 'settings:encryption:getStatus',
  ENCRYPTION_SET_PASSWORD: 'settings:encryption:setPassword',
  ENCRYPTION_CHANGE_PASSWORD: 'settings:encryption:changePassword',
  ENCRYPTION_REMOVE_PASSWORD: 'settings:encryption:removePassword',
  ENCRYPTION_DISMISS_LINUX_NOTICE: 'settings:encryption:dismissLinuxNotice',
  ENCRYPTION_UNLOCK_ATTEMPT: 'settings:encryption:unlock-attempt',
  ENCRYPTION_LINUX_NOTICE: 'settings:encryption:linux-notice',
  ENCRYPTION_KEY_REGENERATED_WARNING: 'settings:encryption:key-regenerated-warning',
  ```
- [ ] `EncryptionStatus` type in `src/shared/types.ts`:
  ```typescript
  interface EncryptionStatus {
    available: boolean;         // safeStorage.isEncryptionAvailable()
    mode: 'safeStorage' | 'password' | 'e2e-test';
    passwordSet: boolean;
    linuxBasicText: boolean;    // backend === 'basic_text'
    linuxNoticeDismissed: boolean;
  }
  ```
- [ ] `settings:encryption:getStatus` handler → reads key file + queries safeStorage
- [ ] `settings:encryption:setPassword { newPassword }` → verify current mode is safeStorage; derive wrapping key; re-wrap; `updateKeyWrapping()`
- [ ] `settings:encryption:changePassword { oldPassword, newPassword }` → `unwrapWithPassword(oldPassword)` to verify; re-wrap with `newPassword`; `updateKeyWrapping()`
- [ ] `settings:encryption:removePassword { currentPassword }` → `unwrapWithPassword` to verify; re-wrap with safeStorage; `updateKeyWrapping()`
- [ ] `settings:encryption:dismissLinuxNotice` → set `linuxNoticeDismissed: true` in key file via `updateKeyWrapping()`
- [ ] Expose in preload: `window.polyphon.encryption.getStatus()`, `setPassword(p)`, `changePassword(old, new)`, `removePassword(p)`, `dismissLinuxNotice()`, `unlockAttempt(p)`, `onLinuxNotice(handler)`
- [ ] `<EncryptionSection />`:
  - status badge: "System keychain" or "Password-protected"
  - set password form (when mode is safeStorage)
  - change/remove password forms (when mode is password)
  - irrecoverability warning: "If you forget your password, your data cannot be recovered. There is no reset mechanism."
  - Linux basic_text inline note (when `linuxBasicText && !passwordSet`)
  - on Linux notice IPC: show dismissible notice banner
- [ ] Mount `<EncryptionSection />` in `SettingsPage.tsx`
- [ ] Subscribe to `ENCRYPTION_LINUX_NOTICE` in `App.tsx` or `EncryptionSection` → show notice once

#### 8. Documentation — `site/content/docs/settings.md`

**Tasks:**
- [ ] Add **Encryption** section (after About, before Data Location) — see Documentation section below for full text
- [ ] Update **Data Location** section to mention `polyphon.key.json` alongside `polyphon.db`, with backup guidance and portability note

---

### P1: Ship If Capacity Allows

- [ ] Unlock window: after 5 consecutive wrong passwords, add a brief (3s) cooldown before re-enabling the Submit button; show "Too many attempts, wait a moment" message
- [ ] Integration test: write plaintext rows to all affected tables directly via raw SQL (simulating a pre-encryption install); confirm all rows read back correctly after `initFieldEncryption` is called — explicit regression for the plaintext fallback path
- [ ] Settings UI: "Back up your key file" helper link in `<EncryptionSection />` that opens the userData directory in Finder/Explorer
- [ ] Developer-only logs around key wrap mode and startup branch (guarded by `!app.isPackaged`)

### Deferred

- **Bulk re-encryption of existing plaintext rows** — old rows stay plaintext until naturally updated; full background migration is a follow-on sprint
- **Key rotation** — generate a new DB key and re-encrypt all rows; deferred
- **Export/backup with embedded key** — deferred
- **Hardware security keys (Secure Enclave, YubiKey)** — deferred
- **Encrypt provider API keys** — these are env-var-based; out of scope
- **SQLCipher / full-database encryption** — explicitly out of scope per the seed

---

## Files Summary

| File | Action | Purpose |
|------|--------|---------|
| `src/main/security/fieldEncryption.ts` | Create | AES-256-GCM encrypt/decrypt singleton; plaintext fallback |
| `src/main/security/fieldEncryption.test.ts` | Create | Unit tests: round-trip, null, fallback, wrong-key |
| `src/main/security/keyManager.ts` | Create | DB key gen, wrapping (safeStorage + password), key file I/O, loadOrCreateKey |
| `src/main/security/keyManager.test.ts` | Create | Unit tests: all paths |
| `src/main/security/unlockWindow.ts` | Create | BrowserWindow for password prompt; unlock IPC handler |
| `src/main/index.ts` | Modify | Insert `loadOrCreateKey` + `initFieldEncryption` before `getDb()`; Linux notice after win.show() |
| `src/main/db/queries/messages.ts` | Modify | Encrypt content on write, decrypt on read |
| `src/main/db/queries/userProfile.ts` | Modify | Fix INSERT OR REPLACE → UPDATE; encrypt 3 profile fields |
| `src/main/db/queries/customProviders.ts` | Modify | Encrypt base_url on write, decrypt on read |
| `src/main/db/queries/systemPromptTemplates.ts` | Modify | Encrypt content on write, decrypt on read |
| `src/main/db/queries/compositions.ts` | Modify | Encrypt system_prompt + cli_args on write, decrypt on read |
| `src/main/ipc/settingsHandlers.ts` | Modify | 5 new encryption IPC handlers |
| `src/main/preload.ts` | Modify | Expose `window.polyphon.encryption` namespace (7 methods) |
| `src/shared/constants.ts` | Modify | 7 new IPC channel constants |
| `src/shared/types.ts` | Modify | Add `EncryptionStatus` type |
| `src/renderer/components/PasswordPrompt/PasswordPromptView.tsx` | Create | Password entry form; quit button |
| `src/renderer/components/Settings/EncryptionSection.tsx` | Create | Encryption settings card with status, forms, warnings |
| `src/renderer/components/Settings/SettingsPage.tsx` | Modify | Mount `<EncryptionSection />` |
| `src/renderer/App.tsx` | Modify | Render `<PasswordPromptView />` when `?view=unlock`; subscribe to Linux notice |
| `site/content/docs/settings.md` | Modify | Encryption section + Data Location update |

---

## Definition of Done

**Crypto foundation:**
- [ ] `fieldEncryption` unit tests pass: round-trip, null input, plaintext fallback, "ENC:v1:" prefix with bad authTag returns ""
- [ ] `keyManager` unit tests pass: generate key, safeStorage wrap/unwrap, password wrap/unwrap (N=16384 r=8 p=1), wrong password throws, key file read/write atomic
- [ ] `encryptField` is never called before `initFieldEncryption` in production code (throws if used uninitialized)

**Query layer:**
- [ ] Integration test for each modified query file: new write stores `ENC:v1:…` in DB (verified via raw SQL); query helper returns decrypted original value
- [ ] Integration test for each modified query file: old plaintext row written directly to DB is read back correctly (fallback path)
- [ ] `upsertUserProfile` no longer uses `INSERT OR REPLACE`; existing integration tests pass

**Startup:**
- [ ] `loadOrCreateKey` is called before `getDb()` in `app.whenReady()`
- [ ] `initFieldEncryption` is called before any query function runs
- [ ] `POLYPHON_E2E=1`: startup proceeds without OS keychain calls; no unlock window appears; `make test-e2e` passes unchanged

**Key file:**
- [ ] `polyphon.key.json` is created on first run in the userData directory
- [ ] Key file is written atomically (`.tmp` → rename)
- [ ] Setting a password rewrites key file with `wrapping: 'password'`
- [ ] Removing password rewrites key file with `wrapping: 'safeStorage'`
- [ ] Key file is never missing `linuxNoticeDismissed` field

**Password window:**
- [ ] On restart with `wrapping: 'password'`: unlock window appears before main window
- [ ] Correct password opens the app normally; unlock window closes
- [ ] Wrong password shows error; input is cleared; user can retry without restarting
- [ ] "Quit Polyphon" button present and functional
- [ ] `PasswordPromptView` unit tests pass

**Field encryption — verified by raw SQL inspection on a dev build:**
- [ ] `messages.content` stored as `ENC:v1:…` after a new write
- [ ] `user_profile.conductor_name`, `pronouns`, `conductor_context` stored encrypted
- [ ] `custom_providers.base_url` stored encrypted
- [ ] `system_prompt_templates.content` stored encrypted
- [ ] `composition_voices.system_prompt` and `cli_args` stored encrypted
- [ ] Old plaintext rows load without error or data loss

**Settings UI:**
- [ ] Encryption section visible in Settings
- [ ] Mode badge shows correct state
- [ ] Set/change/remove password forms work end-to-end (manual verification with `make dev`)
- [ ] Irrecoverability warning is present and prominent
- [ ] Linux basic_text notice fires and can be dismissed (persisted in key file)

**Failure modes:**
- [ ] safeStorage unavailable (`isEncryptionAvailable() === false`): `loadOrCreateKey` shows fatal error dialog and quits gracefully (does not crash or proceed with no encryption)
- [ ] Key file missing at startup (safeStorage mode, not first run): treated as first-run — generate new key, create new key file (data loss: encrypted rows are unreadable; documented)
- [ ] Key file missing at startup (password mode): same — generate new key (data loss; documented)
- [ ] Key file corrupted (JSON parse error): show fatal error dialog and quit

**Documentation:**
- [ ] `site/content/docs/settings.md` Encryption section added with correct content
- [ ] Data Location section notes `polyphon.key.json` must be backed up alongside `polyphon.db`
- [ ] Docs note that safeStorage-wrapped key is machine+account-bound; password-wrapped key is portable
- [ ] `cd site && hugo --minify` produces no errors

**Write-path coverage:**
- [ ] `grep -r "db.prepare" src/main/db/queries/` confirms no raw SQL writes to `messages.content`, `user_profile.conductor_name/pronouns/conductor_context`, `custom_providers.base_url`, `system_prompt_templates.content`, `composition_voices.system_prompt`, or `composition_voices.cli_args` exist outside the designated `insertMessage`, `upsertUserProfile`, `insertCustomProvider`/`updateCustomProvider`, `insertTemplate`/`updateTemplate`, and `upsertCompositionVoices` functions

**Decrypt-failure UX:**
- [ ] `DECRYPTION_FAILED_SENTINEL` is exported from `fieldEncryption.ts`
- [ ] `MessageBubble` (or equivalent) renders `[Message unavailable]` when content equals `DECRYPTION_FAILED_SENTINEL`
- [ ] Profile fields that return `DECRYPTION_FAILED_SENTINEL` do not crash the settings page

**Key regeneration warning:**
- [ ] Non-first-run startup with missing key file shows `ENCRYPTION_KEY_REGENERATED_WARNING` notification in the renderer

**Password operation safety:**
- [ ] `updateKeyWrapping` re-reads and verifies the key file immediately after writing; throws (preventing the atomic rename completing) if verification fails
- [ ] Manual test: set password → Force-kill app between `.tmp` write and rename (or simulate with a test) → restart → app starts normally with old key

**Packaged build:**
- [ ] safeStorage behavior manually verified on at least one platform (macOS or Windows) using a packaged build (`make package`); Layer 1 encryption confirmed operational outside dev mode

**Regression:**
- [ ] `make test-unit && make test-integration` pass
- [ ] `POLYPHON_E2E=1 make test-e2e` passes unchanged

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| User forgets password — data unrecoverable | Medium | High | Prominent irrecoverability warning in UI and docs; no recovery mechanism by design |
| safeStorage key becomes unreadable (OS keychain reset, account change) | Low | High | Fatal error dialog on startup; documented recovery: delete key file (data loss) and restart |
| `upsertUserProfile` INSERT OR REPLACE fix regressions profile saves | Low | Medium | Existing integration tests cover this; confirm row count and all fields after save |
| Atomic key file write fails midway on low-disk or crash | Low | High | `.tmp` + `renameSync` is atomic at OS level; if `.tmp` exists on startup with no main file, treat as corruption |
| Startup ordering: `initFieldEncryption` not called before a query | Low | High | `encryptField`/`decryptField` throw if called uninitialized; will surface immediately in any test that uses the query layer |
| Ciphertext exposed as plaintext via "ENC:v1:" fallback | Low | High | Split fallback: `"ENC:v1:"` prefix + failed decrypt → empty string + log; never returns ciphertext as user-visible data |
| Linux basic_text wrapping weaker than advertised | High | Medium | One-time notice; docs state the limitation; password wrapping recommended |

---

## Security Considerations

- **Threat model**: disk theft / filesystem imaging. Attacker with `polyphon.db` only gets ciphertext. Attacker with `polyphon.db` + `polyphon.key.json` (safeStorage mode) still needs OS keychain access. Attacker with both files (password mode) needs both files AND the password.
- **Key never in IPC plaintext**: DB key stays in main-process memory only. IPC handlers accept passwords and return status, never key material.
- **AES-256-GCM integrity**: each encrypted field includes a 16-byte auth tag; tampered ciphertext causes decryption to fail cleanly (returns "" + log, not garbage).
- **IV uniqueness**: each `encryptField` call generates a fresh 12-byte IV via `randomBytes(12)`.
- **scrypt parameters**: N=16384, r=8, p=1, keylen=32 — OWASP minimum.
- **`polyphon.key.json` file permissions**: written with default Node.js permissions (0o644 masked by umask). Not encrypted at the filesystem level — protection comes from the wrapping layer. Documented limitation.
- **No new npm dependencies** — uses `node:crypto` built-in only.
- **safeStorage-backed key is machine+account-bound**: copying `polyphon.key.json` to another machine or user account will make the safeStorage-wrapped key unreadable. Password-wrapped key is portable. Documented in both Settings UI and docs.

---

## Observability & Rollback

**Manual verification:**
1. `make dev` → send a message → `sqlite3 ~/Library/Application\ Support/polyphon/polyphon.db "SELECT content FROM messages ORDER BY rowid DESC LIMIT 1"` → should show `ENC:v1:…`
2. Settings → Encryption → set password → quit → restart → password window appears → correct password → app opens
3. Settings → Encryption → remove password → restart → no password window

**Rollback:**
If encryption causes data loss or startup crashes, revert the query-layer and startup changes. After rollback: new writes will be plaintext. Rows written as `ENC:v1:…` will appear verbatim (unreadable) in the app — a separate one-time migration could strip the prefix if needed. The key file remains on disk but is harmless.

---

## Documentation

### Full Encryption section text for `site/content/docs/settings.md`

```markdown
## Encryption

Polyphon encrypts sensitive data stored in your local database. Encryption is
field-level using AES-256-GCM.

### What is encrypted

The following fields are encrypted at rest:

- Message content
- Conductor Profile (name, pronouns, background context)
- Custom provider base URLs
- System prompt template content
- Composition voice system prompts and CLI arguments

Metadata such as session names, composition names, timestamps, and voice colors
is not encrypted.

> **Note:** Encryption protects newly written data. Rows written by older
> versions of Polyphon remain as plaintext and are loaded transparently. They
> will be encrypted the next time they are updated by the app.

### Two-layer model

**Layer 1 — System keychain (automatic):** On first run, Polyphon generates a
random 256-bit database key and stores it in your operating system's secure
storage (macOS Keychain, Windows DPAPI, Linux libsecret). This happens silently
with no user action required. This key is tied to your machine and account.

**Layer 2 — Password (optional):** You can add a password in Settings →
Encryption. When a password is set, the database key is re-wrapped using your
password. A password prompt appears before the main window on each startup.
Password-wrapped keys are portable: you can restore your database to a different
machine by providing the same password.

### Setting, changing, or removing a password

Open **Settings → Encryption**. The status card shows whether your data is
protected by the system keychain or by a password.

- **Set a password** — click **Set password**, enter and confirm a new password,
  click **Save**. Polyphon re-wraps the database key immediately. The next
  restart will require your password.
- **Change a password** — click **Change password**, enter your current password
  and the new one, click **Save**.
- **Remove a password** — click **Remove password**, enter your current password
  to confirm, click **Remove**. The database key reverts to system keychain
  wrapping. No password prompt on the next restart.

> **Warning:** If you forget your password, your encrypted data is
> unrecoverable. There is no reset or recovery mechanism. Back up your key file
> and database together — see Data Location below.

### Linux notice

On Linux, Polyphon uses libsecret for system keychain storage. If libsecret is
not available, Polyphon falls back to a basic text store, which provides weaker
at-rest protection. If this applies to your system, Polyphon will show a
one-time recommendation to set a password. A password provides strong protection
regardless of the system keychain backend.
```

### Updated Data Location section

Add after the existing table:

> `polyphon.key.json` is stored in the same directory as `polyphon.db`. **Back
> up both files together.** Restoring `polyphon.db` without its matching
> `polyphon.key.json` will make encrypted data unreadable.
>
> If your database key is wrapped by the system keychain (the default), the key
> file is tied to your machine and account — it cannot be transferred to another
> machine. If you set a password, the key file is portable and can be used on
> any machine with the correct password.

---

## Dependencies

- No new npm dependencies (uses `node:crypto` built-in: `randomBytes`, `createCipheriv`, `createDecipheriv`, `scryptSync`)
- `electron.safeStorage` is available in all supported Electron versions
- `app.whenReady()` is already async; no startup architecture changes beyond adding the key-loading step

---

## Devil's Advocate and Security Critiques Addressed

| Critique | Source | Action |
|---|---|---|
| `decryptField` returning `""` on failure is silent data loss | DA + Security | Changed to `DECRYPTION_FAILED_SENTINEL`; UI components render `[Message unavailable]`; added to DoD |
| Missing key file treated as first-run generates new key silently | DA | Added: detect non-first-run + warn user via `ENCRYPTION_KEY_REGENERATED_WARNING` IPC; added to DoD |
| No verification all write paths use encrypted helpers | DA | Added write-path coverage grep to DoD |
| Password change safety under interruption | DA + Security | `updateKeyWrapping` verifies-after-write before completing; added manual test to DoD |
| Packaged-app safeStorage behavior not verified | DA | Added packaged-build verification to DoD |
| Password length not bounded in IPC | Security | Added length validation guard in IPC handler; added to DoD implicitly via IPC handler task |
| Key file written with world-readable permissions on Linux | Security | Added note: write with `0o600` on Unix; key file permissions task added |
| safeStorage hex round-trip not tested | Security | Added byte-for-byte unit test assertion |
| Key file `version` field not validated | Security | `readKeyFile` throws on `version !== 1`; added |
| `ENC:v1:` prefix collision (user types sentinel in content) | Security | Acknowledged; null-byte delimiters make `DECRYPTION_FAILED_SENTINEL` impossible in UI; `ENC:v1:` prefix collision is low-risk and documented |
| DA claim: "module-level singleton is brittle" | DA | Rejected — appropriate for single-window Electron app; singleton is the conventional pattern here |
| DA claim: field list may be incomplete | DA | Rejected — seed specifies exactly which fields to encrypt; not expanding scope |
| DA claim: "default-safe" overstated on Linux | DA | Overview updated to explicitly mention Linux fallback |
| DA claim: rollback is expensive | DA | Acknowledged and documented in Rollback section; not a blocking change |
| DA claim: password UX should move to P1 | DA | Rejected — seed requires Layer 2 as part of the feature |

## Open Questions

All resolved during planning and critique phases.

1. **Existing rows**: passive fallback only — old plaintext rows load via decryptField fallback; no bulk re-encryption this sprint ✅
2. **Password window**: separate BrowserWindow reusing existing renderer at `?view=unlock` ✅
3. **E2E test key**: `Buffer.alloc(32)` fixed key when `POLYPHON_E2E=1` ✅
4. **SCHEMA_VERSION**: stays at 2 — no schema changes, no migration 003 ✅
5. **Folder name**: `src/main/security/` ✅
6. **IPC namespace**: `settings:encryption:*` ✅
7. **Linux notice dismissal**: persisted in `polyphon.key.json` as `linuxNoticeDismissed` ✅
8. **decryptField split behavior**: not-encrypted → raw; decrypt-failed → "" + log ✅
9. **upsertUserProfile INSERT OR REPLACE bug**: fixed in this sprint ✅
