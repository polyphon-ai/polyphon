# Sprint 003: In-App Update Notifications

## Overview

Polyphon currently releases new versions to `polyphon-ai/releases` on GitHub, but the app
has no way to tell users a newer version is available. This sprint adds two capabilities:
a cross-platform update notification toast and — on macOS and Windows — an in-app install
mechanism powered by `update-electron-app`.

The notification flow is intentionally simple: on startup the main process fetches the
latest release from the GitHub API, compares it against the running version, and (if newer)
emits an IPC event to the renderer. The renderer shows a persistent top-of-screen banner
with two dismiss actions: "Remind me later" (session-only dismiss) and "Don't remind me
again for this release" (written to SQLite so the banner stays gone across restarts for
that specific release). On macOS and Windows, the banner also has an "Install now" button
that triggers the Squirrel-backed auto-updater via `update-electron-app`. On Linux, a
"Download" link opens the releases page in the browser.

The update check runs after the window has been created (non-blocking, async) and is a
no-op in e2e test mode (`POLYPHON_E2E` env var).

---

## Use Cases

1. **User is on an older version** — on next startup, a top banner appears: "Polyphon v0.2.0
   is available. You are on v0.1.0." + "Install now" (macOS/Windows) or "Download" (Linux)
   + "Remind me later" + "Don't remind me again for this release"
2. **User dismisses with "Remind me later"** — banner disappears for the current session;
   reappears next time the app starts
3. **User dismisses with "Don't remind me again for this release"** — the dismissed version
   is written to SQLite; the banner does not reappear for that version across restarts
4. **User clicks "Install now" (macOS/Windows)** — `autoUpdater.quitAndInstall()` is called;
   app restarts with the new version already applied
5. **User is already on latest** — no banner, no noise
6. **Network offline / GitHub API error** — check fails silently; no banner; no error surfaced

---

## Architecture

```
Main process (startup)
  └── checkForUpdate()
        ├── fetch https://api.github.com/repos/polyphon-ai/releases/releases/latest
        ├── compare latestVersion vs app.getVersion()
        ├── if newer → win.webContents.send(IPC.UPDATE_AVAILABLE, { version, url })
        └── (macOS/Windows only) update-electron-app with notifyUser:false
              └── autoUpdater events → win.webContents.send(IPC.UPDATE_READY)

IPC channels (main → renderer push):
  update:available   { version: string, releaseUrl: string }

IPC channels (renderer → main invoke):
  update:dismiss     { version: string, permanently: boolean }
                     permanently=true  → write dismissed_update_version to DB
                     permanently=false → write update_remind_after = now+24h to DB

Renderer (App.tsx top-level)
  └── UpdateBanner component
        ├── shows when uiStore.updateAvailable is set
        ├── "Remind me later" → invoke update:dismiss(version, false) + clears state
        ├── "Don't remind me again for this release" → invoke update:dismiss(version, true) + clears state
        └── "Download" → openExternal(releaseUrl) — all platforms

SQLite (user_profile row, id=1)
  ├── dismissed_update_version TEXT NOT NULL DEFAULT ''  — "don't show again" for version X
  └── update_remind_after INTEGER NOT NULL DEFAULT 0     — Unix ms; "remind later" sets to now+24h
        (migration 002: ALTER TABLE user_profile ADD COLUMN … ×2)
```

---

## Implementation Plan

### P0: Must Ship

#### 1. Database migration

**Files:**
- `src/main/db/schema.ts` — add `dismissed_update_version` column to `CREATE_TABLES_SQL`
- `src/main/db/migrations/002_add_dismissed_update_version.ts` — `ALTER TABLE user_profile ADD COLUMN dismissed_update_version TEXT NOT NULL DEFAULT ''`
- `src/main/db/migrations/index.ts` — register migration; bump SCHEMA_VERSION to 2 in `schema.ts`

**Tasks:**
- [ ] Add `dismissed_update_version TEXT NOT NULL DEFAULT ''` to `user_profile` in `CREATE_TABLES_SQL`
- [ ] Add `update_remind_after INTEGER NOT NULL DEFAULT 0` to `user_profile` in `CREATE_TABLES_SQL`
- [ ] Write migration `002_add_update_preferences.ts` with `up(db)` that runs both ALTER TABLEs
- [ ] Register in `runMigrations`: read `currentVersion`, if `< 2` run migration 002, bump to 2
- [ ] Bump `SCHEMA_VERSION` from 1 to 2 in `schema.ts`
- [ ] Update migrations integration test to verify migration 002 runs cleanly on a v1 DB

#### 2. Version comparison utility

**Files:**
- `src/main/utils/version.ts` — `isNewerVersion(current: string, candidate: string): boolean`
- `src/main/utils/version.test.ts` — unit tests

**Tasks:**
- [ ] Implement `isNewerVersion` using semver comparison (no semver library — parse `X.Y.Z` manually to avoid a new dep)
- [ ] Test cases: same version, patch newer, minor newer, major newer, pre-release ignored

#### 3. IPC channels

**Files:**
- `src/shared/constants.ts` — add `UPDATE_AVAILABLE`, `UPDATE_DISMISS`
- `src/shared/types.ts` — add `UpdateInfo { version: string; releaseUrl: string }`
- `src/main/ipc/index.ts` — register `update:dismiss` handler
- `src/main/preload.ts` — expose `update` API namespace: `onAvailable`, `dismiss`

**Tasks:**
- [ ] Add IPC constants to `src/shared/constants.ts`
- [ ] Add `UpdateInfo` type to `src/shared/types.ts`
- [ ] Implement `update:dismiss` handler:
  - `permanently=true` → write `dismissed_update_version = version` to `user_profile`
  - `permanently=false` → write `update_remind_after = Date.now() + 24 * 60 * 60 * 1000` to `user_profile`
- [ ] Expose in preload: `window.polyphon.update.onAvailable(handler)`, `dismiss(version, permanently)`

#### 4. Update checker (main process)

**Files:**
- `src/main/utils/updateChecker.ts` — `checkForUpdate(db, win): Promise<void>`

**Tasks:**
- [ ] Fetch `https://api.github.com/repos/polyphon-ai/releases/releases/latest`
- [ ] Parse `tag_name` (strip leading `v`), `html_url`
- [ ] Skip if `process.env.POLYPHON_E2E` (test guard)
- [ ] Read `dismissed_update_version` and `update_remind_after` from `user_profile`
- [ ] If `isNewerVersion(currentVersion, latestVersion)` AND `latestVersion !== dismissedVersion`
  AND `Date.now() >= update_remind_after`
  → `win.webContents.send(IPC.UPDATE_AVAILABLE, { version, releaseUrl })`
- [ ] Catch all errors silently (network offline, rate limit, etc.)

#### 5. No auto-install this sprint

All platforms use a "Download" link that opens the GitHub releases page. Squirrel /
`update-electron-app` / `electron-updater` are all deferred. No new npm dependencies for
the update mechanism itself.

#### 6. UpdateBanner component

**Files:**
- `src/renderer/components/Shared/UpdateBanner.tsx` — new component
- `src/renderer/store/uiStore.ts` — extend with `updateAvailable: UpdateInfo | null`
- `src/renderer/App.tsx` — mount `<UpdateBanner />` above all views

**Tasks:**
- [ ] `UpdateBanner` reads `uiStore.updateAvailable`
- [ ] Renders a slim top banner: "Polyphon vX.Y.Z is available" + three actions
- [ ] "Remind me later": calls `window.polyphon.update.dismiss(version, false)` + clears store (24h cooldown written to DB)
- [ ] "Don't remind me again for this release": calls `window.polyphon.update.dismiss(version, true)` + clears store
- [ ] "Download": calls `window.polyphon.shell.openExternal(releaseUrl)` — same on all platforms
- [ ] On mount, register `window.polyphon.update.onAvailable` listener; clean up on unmount
- [ ] Write unit test for `UpdateBanner` render + button behavior with mocked `window.polyphon`

---

### P1: Ship If Capacity Allows

- [ ] Show "What's new?" link in the banner that opens the GitHub release notes URL
- [ ] Add a manual "Check for updates" button in Settings → About page
- [ ] Show the current dismissed version in About page (with a "Re-enable notifications" action)

### Deferred

- **In-app auto-install on macOS/Windows** — `update-electron-app` (Squirrel) requires notarization; deferred until signing is configured in CI
- **Cross-platform auto-install via `electron-updater`** — requires YAML metadata in CI; deferred
- **Release notes in-app** — fetching and rendering changelog markdown is a future enhancement
- **Pre-release / beta channel** — only stable releases are checked; pre-releases always skipped

---

## Files Summary

| File | Action | Purpose |
|------|--------|---------|
| `src/main/db/schema.ts` | Modify | Add `dismissed_update_version` and `update_remind_after` to user_profile |
| `src/main/db/migrations/002_add_update_preferences.ts` | Create | Migration: ALTER TABLE user_profile ×2 |
| `src/main/db/migrations/index.ts` | Modify | Register migration 002; bump SCHEMA_VERSION to 2 |
| `src/main/utils/version.ts` | Create | `isNewerVersion` semver comparison utility |
| `src/main/utils/version.test.ts` | Create | Unit tests for version comparison |
| `src/main/utils/updateChecker.ts` | Create | GitHub API fetch + IPC dispatch |
| `src/main/ipc/index.ts` | Modify | Register update:dismiss handler |
| `src/main/index.ts` | Modify | Call checkForUpdate after window creation |
| `src/shared/constants.ts` | Modify | Add UPDATE_AVAILABLE, UPDATE_DISMISS |
| `src/shared/types.ts` | Modify | Add UpdateInfo type |
| `src/main/preload.ts` | Modify | Expose update.onAvailable + update.dismiss |
| `src/renderer/store/uiStore.ts` | Modify | Add updateAvailable state |
| `src/renderer/components/Shared/UpdateBanner.tsx` | Create | Update notification banner component |
| `src/renderer/App.tsx` | Modify | Mount UpdateBanner above all views |

---

## Definition of Done

- [ ] `dismissed_update_version` and `update_remind_after` columns exist in `user_profile` via migration 002
- [ ] Migration runs cleanly on a v1 database (integration test passes)
- [ ] `isNewerVersion` utility tested for same, patch, minor, major, and pre-release cases
- [ ] Update check fires on startup, is skipped when `POLYPHON_E2E=1`
- [ ] When running version is lower than latest non-pre-release, `UPDATE_AVAILABLE` event reaches renderer
- [ ] Banner renders with version string and all three action buttons ("Remind me later", "Don't remind me again for this release", "Download")
- [ ] "Remind me later" writes `update_remind_after = now+24h` to DB; banner absent for next 24h; reappears after cooldown
- [ ] "Don't remind me again for this release" persists `dismissed_update_version` to DB; banner absent on restart for that version
- [ ] "Download" opens the correct GitHub releases URL via `shell.openExternal`
- [ ] No platform-specific code paths (no `autoUpdater`, no Squirrel, no Linux guards)
- [ ] Existing e2e suite passes unchanged
- [ ] All new unit + integration tests pass (`make test-unit && make test-integration`)

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| GitHub API rate limit (60 req/hr unauthenticated) | Low | Low | Single check per startup; silent failure on error |
| GitHub API returns pre-release as latest | Low | Low | Filter on `prerelease: false` in the API response |
| Banner obscures the app UI | Low | Low | Slim banner design; always dismissible; no update = no banner |
| Migration 002 alter conflicts with future migrations | Low | Medium | Migrations are append-only; convention already in CLAUDE.md |
| User dismisses "Remind me later" and then checks immediately | Low | Low | Cooldown is server-side (DB timestamp); banner won't reappear within 24h regardless |

---

## Security Considerations

- GitHub API response is parsed only for `tag_name` and `html_url`; no eval or dynamic code execution
- `releaseUrl` is opened via `shell.openExternal` which is already allowlisted for `github.com`
- Update-electron-app uses HTTPS for all downloads via Squirrel; Squirrel verifies code signatures
- No API key or auth token is used for the GitHub API check; unauthenticated requests are sufficient
- Version string from API is compared numerically, never eval'd or executed

---

## Observability & Rollback

- **Verification**: Set `package.json` version to `0.0.1`, run `make dev`, confirm banner appears.
  Set dismissed version in DB manually, restart, confirm banner absent.
- **Logs**: `console.log` in `updateChecker.ts` for check result (dev only; guarded by `!app.isPackaged`)
- **Rollback**: All changes are additive (new column with DEFAULT, new IPC channels, new component).
  Reverting is a `git revert`; the new column does no harm if the code is reverted.

---

## Documentation

- [ ] Update `CLAUDE.md` IPC Channels table to include the four new `update:*` channels
- [ ] Update `CLAUDE.md` schema section to mention `dismissed_update_version` in `user_profile`
- [ ] Note the `POLYPHON_E2E` guard in the schema/migrations section as a pattern for future test guards

---

## Dependencies

- No new npm runtime dependencies — the update check uses the Node.js built-in `fetch` API
- No CI changes required

---

## Open Questions

1. **macOS code signing in CI** — if builds are not notarized, Squirrel.macOS will not apply
   updates even if downloaded. Should the "Install now" button be macOS-only in signed
   production builds, or is it acceptable to show it in all non-Linux builds and accept that
   it may silently fail?
2. **"Remind me later" granularity** — session-only or 24-hour cooldown? Current plan is
   session-only (simpler); a timestamp-based cooldown can be added in a follow-on sprint.
3. **Pre-release filtering** — should the checker skip releases tagged as pre-release on GitHub
   (e.g., `-beta`, `-rc`)? Current plan: skip pre-releases (GitHub API `prerelease: true` flag).
