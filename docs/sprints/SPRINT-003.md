# Sprint 003: In-App Update Notifications

## Overview

Polyphon builds and publishes releases to `polyphon-ai/releases` on GitHub but currently has no
way to tell users when a newer version is available. This sprint is about **awareness first,
installation second**: a cross-platform update notification banner that appears on startup when a
newer release exists, respects user dismissal preferences across restarts, and always routes
users to the Polyphon download page.

The update check runs asynchronously after the window is shown (no impact on startup time). The
main process fetches `https://api.github.com/repos/polyphon-ai/releases/releases/latest`,
compares the result against the running version, and — if a newer version is available and not
suppressed by a user preference — sends it to the renderer via IPC. The renderer shows a slim
top-of-screen banner with three actions: "Remind me later" (24-hour cooldown written to SQLite),
"Don't remind me again for this release" (persists the dismissed version to SQLite), and
"Download" (opens `https://polyphon.ai/#download` in the browser, same on all platforms).

No auto-install mechanism is shipped this sprint. Squirrel, `update-electron-app`, and
`electron-updater` are all deferred pending macOS code signing being configured in CI.

---

## Sprint Theme

**Awareness first, installation second.** Make new releases visible and non-annoying without
taking on the platform-specific complexity of auto-update.

---

## Use Cases

1. **User is on an older version** — on next startup, a slim top banner appears: "Polyphon v0.2.0
   is available." + "Remind me later" + "Don't remind me again for this release" + "Download"
2. **User clicks "Remind me later"** — the 24-hour cooldown timestamp is written to SQLite;
   banner disappears for the rest of this session and does not reappear within 24 hours
3. **User clicks "Don't remind me again for this release"** — the dismissed version is written to
   SQLite; banner does not reappear for that exact release version across any number of restarts
4. **A newer release supersedes a previously dismissed one** — `dismissed_update_version = "0.2.0"`
   does not block the banner when `0.3.0` is published; the banner reappears
5. **User clicks "Download"** — `shell.openExternal` opens `https://polyphon.ai/#download` in the
   browser on macOS, Windows, and Linux
6. **User is already on the latest version** — no banner, no noise
7. **Network offline or GitHub API error** — check fails silently; no banner; no error surfaced

---

## Architecture

```
Main process (startup, after window show)
  └── checkForUpdate(db, win): Promise<void>
        ├── skip if POLYPHON_E2E=1
        ├── fetch /repos/polyphon-ai/releases/releases/latest
        ├── normalize tag_name: strip leading "v", reject malformed tags
        ├── skip if prerelease=true (belt-and-suspenders; /releases/latest already excludes them)
        ├── read dismissed_update_version and update_remind_after from user_profile
        ├── if isNewerVersion(current, latest)
        │     AND latest !== dismissed_update_version
        │     AND Date.now() >= update_remind_after
        │   → cache { version } in-process (for get-state requests)
        │   → win.webContents.send(IPC.UPDATE_AVAILABLE, { version })
        └── catch all errors → log in dev, silent in production

IPC channels (main → renderer push):
  update:available   payload: UpdateInfo { version: string }

IPC channels (renderer → main invoke):
  update:get-state   returns: UpdateInfo | null   (renderer calls on mount to handle startup race)
  update:dismiss     args: { version: string, permanently: boolean }
                       permanently=true  → write dismissed_update_version to user_profile
                       permanently=false → write update_remind_after = Date.now()+24h to user_profile

Renderer (App.tsx root layout)
  └── <UpdateBanner />
        ├── on mount: call window.polyphon.update.getState() → if result, set uiStore.updateAvailable
        ├── subscribe to window.polyphon.update.onAvailable → set uiStore.updateAvailable
        ├── "Remind me later" → dismiss(version, false) + clear store
        ├── "Don't remind me again for this release" → dismiss(version, true) + clear store
        └── "Download" → shell.openExternal('https://polyphon.ai/#download')

SQLite (user_profile row, id=1) — migration 002
  ├── dismissed_update_version TEXT NOT NULL DEFAULT ''
  │     keyed to the available release version, not the running version
  └── update_remind_after INTEGER NOT NULL DEFAULT 0
        Unix millisecond timestamp; 0 means "show immediately"
```

---

## Implementation Plan

### P0: Must Ship

#### 1. Database migration

**Files:**
- `src/main/db/schema.ts` — add both columns to `user_profile` in `CREATE_TABLES_SQL`
- `src/main/db/migrations/002_add_update_preferences.ts` — `up(db)` that runs both ALTER TABLEs
- `src/main/db/migrations/index.ts` — register migration 002; bump `SCHEMA_VERSION` to 2 in `schema.ts`
- `src/main/db/schema.ts` — bump `SCHEMA_VERSION` to 2

**Tasks:**
- [ ] Add `dismissed_update_version TEXT NOT NULL DEFAULT ''` to `user_profile` in `CREATE_TABLES_SQL`
- [ ] Add `update_remind_after INTEGER NOT NULL DEFAULT 0` to `user_profile` in `CREATE_TABLES_SQL`
- [ ] Create `002_add_update_preferences.ts` with `up(db: DatabaseSync): void` that runs:
  - `ALTER TABLE user_profile ADD COLUMN dismissed_update_version TEXT NOT NULL DEFAULT ''`
  - `ALTER TABLE user_profile ADD COLUMN update_remind_after INTEGER NOT NULL DEFAULT 0`
- [ ] Register in `runMigrations`: read `currentVersion`, if `< 2` call `up(db)`, then bump to 2
- [ ] Bump `SCHEMA_VERSION` from 1 to 2 in `schema.ts`
- [ ] Extend `src/main/db/queries/userProfile.ts` (or equivalent) to include the two new fields
  in the row type and in the `getUserProfile` / `saveUserProfile` queries
- [ ] Add integration test: migration 002 runs cleanly on a v1 in-memory DB

#### 2. Version comparison utility

**Files:**
- `src/main/utils/version.ts` — `isNewerVersion(current: string, candidate: string): boolean`
- `src/main/utils/version.test.ts` — unit tests

**Tasks:**
- [ ] Parse `X.Y.Z` as three integers (no semver library; avoid new dep)
- [ ] Return `true` only if candidate is strictly greater than current
- [ ] Return `false` for malformed input (non-X.Y.Z strings) without throwing
- [ ] Unit test cases: same version, patch bump, minor bump, major bump, pre-release suffix
  (e.g., `0.2.0-beta.1` treated as not newer than `0.2.0`), malformed tag

#### 3. IPC channels and shared types

**Files:**
- `src/shared/constants.ts` — add `UPDATE_AVAILABLE`, `UPDATE_GET_STATE`, `UPDATE_DISMISS`
- `src/shared/types.ts` — add `UpdateInfo { version: string }`
- `src/main/ipc/index.ts` — register `update:get-state` and `update:dismiss` handlers
- `src/main/preload.ts` — expose `window.polyphon.update` namespace

**Tasks:**
- [ ] Add IPC constants to `src/shared/constants.ts`
- [ ] Add `UpdateInfo { version: string }` type to `src/shared/types.ts`
- [ ] Implement `update:get-state` handler: returns the cached `UpdateInfo | null` from the
  in-process check result (or `null` if check hasn't run yet or found no update)
- [ ] Implement `update:dismiss` handler:
  - `permanently=true` → `UPDATE user_profile SET dismissed_update_version = ?, updated_at = ? WHERE id = 1`
  - `permanently=false` → `UPDATE user_profile SET update_remind_after = ?, updated_at = ? WHERE id = 1`
    where the value is `Date.now() + 24 * 60 * 60 * 1000`
- [ ] Expose in preload:
  - `window.polyphon.update.onAvailable(handler)` → subscribe to `UPDATE_AVAILABLE` push event
  - `window.polyphon.update.getState()` → invoke `UPDATE_GET_STATE`
  - `window.polyphon.update.dismiss(version, permanently)` → invoke `UPDATE_DISMISS`
- [ ] Add integration test: `update:dismiss(version, true)` writes to DB; `update:get-state`
  returns cached UpdateInfo; subsequent dismiss(version, false) writes cooldown

#### 4. Update checker

**Files:**
- `src/main/utils/updateChecker.ts` — `checkForUpdate(db, win): Promise<void>`
- `src/main/utils/updateChecker.ts` — also export `getCachedUpdateInfo(): UpdateInfo | null`

**Tasks:**
- [ ] Skip entirely if `process.env.POLYPHON_E2E`
- [ ] Fetch `https://api.github.com/repos/polyphon-ai/releases/releases/latest`
  with a `User-Agent: polyphon/{version}` header (GitHub API requires this)
- [ ] Parse `tag_name` → normalize version (strip `v` prefix); if malformed, abort silently
- [ ] Skip if `prerelease: true` or `draft: true` in the response
- [ ] Read `dismissed_update_version` and `update_remind_after` from `user_profile`
- [ ] If `isNewerVersion(currentVersion, latestVersion)` AND `latestVersion !== dismissedVersion`
  AND `Date.now() >= update_remind_after`:
  - Store `{ version }` in module-level variable (for `getCachedUpdateInfo`)
  - Send `win.webContents.send(IPC.UPDATE_AVAILABLE, { version })`
- [ ] Catch all errors silently; log in dev only (`!app.isPackaged`)

#### 5. Wire into app startup

**Files:**
- `src/main/index.ts` — call `checkForUpdate` after `createWindow()`

**Tasks:**
- [ ] Import `checkForUpdate` and call it after the window is created: `checkForUpdate(db, win)` — do not await; fire-and-forget
- [ ] No e2e guard needed here (it lives inside `checkForUpdate`)

#### 6. UpdateBanner component

**Files:**
- `src/renderer/components/Shared/UpdateBanner.tsx` — new component
- `src/renderer/store/uiStore.ts` — add `updateAvailable: UpdateInfo | null`, `setUpdateAvailable`, `clearUpdate`
- `src/renderer/App.tsx` — mount `<UpdateBanner />` above all views

**Tasks:**
- [ ] Extend `uiStore` with:
  - `updateAvailable: UpdateInfo | null` (initial: `null`)
  - `setUpdateAvailable(info: UpdateInfo): void`
  - `clearUpdate(): void`
- [ ] `UpdateBanner` on mount:
  1. Calls `window.polyphon.update.getState()` and if non-null sets `uiStore.setUpdateAvailable`
  2. Subscribes to `window.polyphon.update.onAvailable` → sets `uiStore.setUpdateAvailable`
  3. Returns cleanup function to unsubscribe (prevent duplicate listeners on remount)
- [ ] Renders `null` when `uiStore.updateAvailable === null`
- [ ] Banner shows: `"Polyphon v{version} is available"` + three buttons
- [ ] "Remind me later": `dismiss(version, false)` + `clearUpdate()`
- [ ] "Don't remind me again for this release": `dismiss(version, true)` + `clearUpdate()`
- [ ] "Download": `window.polyphon.shell.openExternal('https://polyphon.ai/#download')`
- [ ] Mount in `App.tsx` above the main layout container
- [ ] Unit test: renders when `updateAvailable` is set; hidden when null; button handlers call
  correct IPC with correct args; cleanup unsubscribes listener

---

### P1: Ship If Capacity Allows

- [ ] Add a "Check for updates" button in Settings → About page that calls a `update:check-now`
  IPC channel (triggers `checkForUpdate` on demand)
- [ ] Show the dismissed version in About page with a "Re-enable notifications" clear action

### Deferred

- **In-app auto-install (macOS/Windows)** — requires code signing + notarization in CI; deferred
- **In-app auto-install (Linux AppImage)** — requires `latest.yml` YAML metadata in CI; deferred
- **"What's new?" release notes** — future enhancement
- **Background periodic update polling** — startup-only check is sufficient for now
- **Beta/pre-release channel** — stable releases only

---

## Files Summary

| File | Action | Purpose |
|------|--------|---------|
| `src/main/db/schema.ts` | Modify | Add `dismissed_update_version` + `update_remind_after` to user_profile |
| `src/main/db/migrations/002_add_update_preferences.ts` | Create | ALTER TABLE user_profile ×2 |
| `src/main/db/migrations/index.ts` | Modify | Register migration 002; bump SCHEMA_VERSION to 2 |
| `src/main/db/queries/userProfile.ts` (or equivalent) | Modify | Include new fields in row type + queries |
| `src/main/utils/version.ts` | Create | `isNewerVersion` semver comparison utility |
| `src/main/utils/version.test.ts` | Create | Unit tests (7 cases including malformed input) |
| `src/main/utils/updateChecker.ts` | Create | GitHub API fetch, version check, IPC dispatch, cached result |
| `src/main/ipc/index.ts` | Modify | Register `update:get-state` and `update:dismiss` handlers |
| `src/main/index.ts` | Modify | Call `checkForUpdate(db, win)` after window creation |
| `src/shared/constants.ts` | Modify | Add `UPDATE_AVAILABLE`, `UPDATE_GET_STATE`, `UPDATE_DISMISS` |
| `src/shared/types.ts` | Modify | Add `UpdateInfo` type |
| `src/main/preload.ts` | Modify | Expose `window.polyphon.update` namespace (3 methods) |
| `src/renderer/store/uiStore.ts` | Modify | Add `updateAvailable`, `setUpdateAvailable`, `clearUpdate` |
| `src/renderer/components/Shared/UpdateBanner.tsx` | Create | Update notification banner component |
| `src/renderer/App.tsx` | Modify | Mount `<UpdateBanner />` above main layout |

---

## Definition of Done

- [ ] `dismissed_update_version` and `update_remind_after` columns added to `user_profile` via migration 002
- [ ] Migration 002 runs cleanly on a v1 in-memory DB (integration test)
- [ ] `isNewerVersion` passes all unit test cases including malformed input
- [ ] Update check fires after window creation; skipped when `POLYPHON_E2E=1`
- [ ] GitHub API errors (network, rate limit, malformed JSON, bad tag) are all silent
- [ ] When running version is lower than latest stable release, `UPDATE_AVAILABLE` event fires
- [ ] When running version is lower and check finishes before renderer mounts, `getState()` returns the correct `UpdateInfo`
- [ ] Banner renders "Polyphon v{version} is available" with correct version number
- [ ] "Remind me later": writes `update_remind_after = now+24h` to DB; banner clears; does not reappear within 24h across restarts
- [ ] "Don't remind me again for this release": writes `dismissed_update_version` to DB; banner absent on restart for that version
- [ ] A newer release (e.g., 0.3.0) overrides dismissal of an older one (0.2.0) and shows the banner again
- [ ] "Download": opens `https://polyphon.ai/#download` via `shell.openExternal`; same on macOS, Windows, Linux
- [ ] No platform-specific code paths; no `autoUpdater`; no `update-electron-app`
- [ ] Duplicate `onAvailable` listener registrations are prevented (cleanup on unmount)
- [ ] Existing e2e suite passes unchanged with `POLYPHON_E2E=1`
- [ ] All new unit and integration tests pass (`make test-unit && make test-integration`)
- [ ] `update:dismiss` IPC handler validates version string matches `/^\d+\.\d+\.\d+/` before writing to DB
- [ ] `polyphon.ai` is already in the `shell:openExternal` allowlist; no change needed
- [ ] HTTPS fetch uses default TLS validation; no `rejectUnauthorized` override anywhere
- [ ] Existing `saveUserProfile` IPC handler does NOT write to `dismissed_update_version` or `update_remind_after` columns
- [ ] Banner is visually acceptable in the app shell; verified manually with `make dev` (no overlap with existing UI, no truncation on narrow windows)
- [ ] `update:dismiss` handler and cooldown check accept an optional `now` timestamp parameter (default `Date.now()`) to enable deterministic testing of the 24h cooldown

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| GitHub API rate limit (60 req/hr unauthenticated) | Low | Low | Single check per startup; silent failure on HTTP error |
| GitHub release tag is malformed (e.g., not `vX.Y.Z`) | Low | Low | `isNewerVersion` returns false for malformed input; check aborts silently |
| `/releases/latest` returns wrong release (e.g., draft) | Low | Low | Check `draft: false` and `prerelease: false` in parsed response |
| Banner appears on first launch over onboarding | Low | Low | `checkForUpdate` is fire-and-forget after window show; first-run onboarding is synchronous; timing is not a concern |
| Startup race: check finishes before `onAvailable` listener is registered | Medium | Medium | Mitigated by `getState()` invoke on banner mount; both paths set the same store action |
| Duplicate listeners if `UpdateBanner` remounts | Low | Low | Cleanup function returned from `useEffect` unsubscribes on unmount |

---

## Security Considerations

- GitHub API response parsed only for `tag_name` (version string), `prerelease`, `draft`; no eval; `html_url` is not used
- Download URL is the hardcoded constant `https://polyphon.ai/#download`; opened via `shell.openExternal` which already has `polyphon.ai` in its allowlist
- No auth token used; unauthenticated GitHub API requests are sufficient for public repos
- Version string from API compared numerically, never executed
- No new network endpoints introduced beyond the single GitHub API call

---

## Observability & Rollback

- **Verification**: set `package.json` version to `0.0.1`, run `make dev`, confirm banner
  appears. Then click "Don't remind me again," restart, confirm banner absent.
  Then set `dismissed_update_version = ''` in the DB manually, restart, confirm banner returns.
- **Dev logs**: `console.log('[updateChecker]', ...)` guarded by `!app.isPackaged`
- **Rollback**: all changes are additive (new columns with DEFAULT, new IPC channels, new
  component). `git revert` is safe; the new columns are harmless if the code is reverted.

---

## Documentation

- [ ] Update `CLAUDE.md` IPC Channels table to include `update:available`, `update:get-state`, `update:dismiss`
- [ ] Update `CLAUDE.md` schema section: add `dismissed_update_version` and `update_remind_after` to the `user_profile` row description

---

## Dependencies

- No new npm dependencies
- No CI changes required
- `user_profile` row must exist (already seeded at startup via `INSERT OR IGNORE` in migrations)

---

## Devil's Advocate Critiques Addressed

| Critique | Decision |
|---|---|
| `saveUserProfile` and other user_profile write paths could accidentally overwrite the new columns | **Accepted** — added to DoD: "Existing `saveUserProfile` IPC handler must not touch `dismissed_update_version` or `update_remind_after` columns" |
| `Date.now()` not controlled in tests for 24h cooldown | **Accepted** — `update:dismiss` handler and `checkForUpdate` accept an optional `now: number` parameter (default `Date.now()`) for test injection |
| Banner layout not verified in DoD | **Accepted** — added DoD: banner verified manually with `make dev`; does not overlap with or obscure existing UI |
| Module-level in-process cache is a "second source of truth" alongside SQLite | **Noted** — the cache is startup-only (set once, never mutated after the check); documented clearly in `updateChecker.ts` with a comment; `update:get-state` returns the cache value if set, otherwise null (no DB re-read needed since the check already incorporated DB state) |
| "Silent failure means broken notifier looks identical to healthy one" | **Noted as known limitation** — dev logs added; for a non-critical notification feature this is acceptable |
| Renderer passes `version` back into `update:dismiss` | **Rejected** — the pattern is consistent with how user data flows throughout the app; the version string is validated in the handler (security review Finding 4) |
| `X.Y.Z` parser is fragile for release hygiene | **Rejected** — the releases are controlled by this team; tags are consistently `vX.Y.Z`; simple parser is appropriate and avoids a new dep |
| P1 "Check for updates" button requires cache invalidation rethinking | **Accepted** — P1 deferred; if added, the cache must be cleared on manual check |
| "user_profile single row is a dead end" | **Rejected** — appropriate for current scope; can be revisited if notification model becomes more complex |

## Security Findings Addressed

| Finding | Severity | Action |
|---|---|---|
| `html_url` used as-is (original concern) | Low | **Resolved** — `html_url` is no longer used; download URL is the hardcoded constant `https://polyphon.ai/#download` |
| HTTPS TLS constraint not documented | Low | **Accepted** — added DoD: "HTTPS fetch uses default TLS validation; no `rejectUnauthorized` override" |
| `update:dismiss` accepts arbitrary version strings | Low | **Accepted** — added DoD: handler validates version matches `/^\d+\.\d+\.\d+/` before writing to DB |
| User-Agent version disclosure | Low/Info | No action needed |
| Rate limit shared-IP degradation | Low | Already handled by silent-fail approach |
