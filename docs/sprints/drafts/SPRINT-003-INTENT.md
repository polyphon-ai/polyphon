# Sprint 003 Intent: In-App Update Notifications

## Seed

We are going to release new versions of the application using the github release mechanism on
the https://github.com/polyphon-ai/releases repository. I would like to accomplish two things.
1.) Check for new releases when the application starts up and show a message that there is a
new version available, allow the user to dismiss this toast with either "Remind me later" or
"Don't remind me again for this release". 2.) Is there a standardized best practice mechanism
for allowing users to update their application to the new version without having to go download
and install it manually? Maybe something built into the Electron ecosystem?

## Context

- **Current state**: Polyphon builds and publishes releases to `polyphon-ai/releases` via a
  working GitHub Actions release pipeline (`.github/workflows/release.yml`). The app currently
  has no mechanism to detect or communicate that a newer release is available.
- **SPRINT-002 drafts exist** but no SPRINT-002.md was ever written (different topic: walkthrough
  video improvements). This sprint is numbered 003 to avoid colliding with existing drafts.
- **Version info** is available in the main process via `app.getVersion()` (returns the value
  from `package.json`). The renderer reads `__APP_VERSION__` injected by Vite at build time.
- **Electron Forge + GitHub Releases**: The project uses Electron Forge with Squirrel.Windows,
  MakerDMG (macOS), and MakerAppImage (Linux). No publisher is configured; artifacts are
  uploaded to `polyphon-ai/releases` directly via `softprops/action-gh-release` in CI.
- **No existing toast system**: There is no global notification/toast infrastructure in the
  renderer. Session-scoped error banners exist in `SessionView.tsx` but these are local.

## Recent Sprint Context

**SPRINT-001** — Docs Overhaul (shipped): Rewrote all 11 docs pages, screenshot/video scripts,
full media audit, narration pipeline established.

**SPRINT-002** — Drafts only, never merged: walkthrough video cue/context improvements. SPRINT-
002.md was never written; those drafts remain in `docs/sprints/drafts/`.

## Relevant Codebase Areas

- `src/main/index.ts` — app startup; ideal place to trigger update check after `app.whenReady()`
- `src/main/ipc/index.ts` — IPC handler registration; new `update:*` channels go here
- `src/main/db/schema.ts` + `src/main/db/migrations/index.ts` — schema for persisting dismissed version
- `src/shared/constants.ts` — IPC channel name constants
- `src/shared/types.ts` — shared types; new `UpdateInfo` type needed
- `src/main/preload.ts` — IPC bridge; expose `update.*` API to renderer
- `src/renderer/App.tsx` — root layout; toast banner renders here above all views
- `src/renderer/store/uiStore.ts` — UI state; extend to hold `updateAvailable` state
- `package.json` — `version` field; `repository` field must be set for `update-electron-app`
- `.github/workflows/release.yml` — CI; may need YAML metadata for auto-update

## Constraints

- Must follow project conventions in CLAUDE.md
- SQLite lives in main process only; all update-preference reads/writes go through IPC
- No telemetry without explicit opt-in — the update check itself should be a plain HTTPS fetch
  to the public GitHub API; no analytics events
- Cross-platform: macOS, Windows, and Linux (AppImage) all build and ship
- Update check must not block app startup — async, after window is shown
- E2E tests must continue to pass without real network access; update check must be skippable
  in CI (use `POLYPHON_E2E` env var already used for test mode)

## Success Criteria

1. On startup, the app silently checks `polyphon-ai/releases` for the latest GitHub release
2. If a newer version is available, a persistent banner/toast appears in the renderer
3. "Remind me later" dismisses the toast for the current app session only
4. "Don't remind me again for this release" persists the dismissed version to SQLite; the toast
   does not reappear across restarts for that specific release version
5. The toast provides a way to open the releases page (or trigger in-app update if supported)
6. On macOS and Windows, the app can download and install the update without the user leaving
   the app (using `update-electron-app` with `notifyUser: false` + `autoUpdater` events)
7. On Linux (AppImage), auto-install is not supported; the toast shows a "Download" link instead
8. All new code has unit/integration tests

## Verification Strategy

- Unit test: version comparison utility (`isNewerVersion`)
- Integration test: IPC handler for checking dismissed version against persisted preference
- Manual: set app version lower than latest release, confirm toast appears; click "Don't remind
  me again" and restart; confirm toast does NOT appear
- Manual: `POLYPHON_E2E=1` skips update check; existing e2e suite passes without network

## Uncertainty Assessment

- Correctness uncertainty: Low — GitHub Releases API is well-documented; version comparison is trivial
- Scope uncertainty: Medium — the `update-electron-app` / Squirrel auto-install path requires code
  signing on macOS and a `RELEASES` file on Windows Squirrel; if signing is not configured in CI,
  the auto-install path may not work in production even if the code is correct
- Architecture uncertainty: Low — fits the existing IPC + SQLite + React store pattern cleanly

## Approaches Considered

| Approach | Pros | Cons | Verdict |
| --- | --- | --- | --- |
| **A: Manual GitHub API check + notification only** | Cross-platform; zero new deps; no CI changes; simple and testable | No in-app install; user must go to the browser to download | **Selected for Part 1** — simplest viable notification; always shows for all platforms |
| **B: `update-electron-app` (Squirrel-based auto-update)** | Official Electron team package; handles macOS + Windows auto-install silently; works with GitHub Releases via `update.electronjs.org` service | Linux NOT supported; requires `package.json` to have `repository` field pointing to the public releases repo; macOS requires notarization; `update.electronjs.org` is an external service dependency | **Selected for Part 2** — layer on top of Approach A; handles install on supported platforms |
| **C: `electron-updater` (electron-builder's updater)** | Full cross-platform including AppImage; can be used standalone without switching from Forge | Requires publishing `latest.yml`/`latest-mac.yml`/`latest-linux.yml` YAML metadata files to releases (not generated by Forge); significant CI changes; adds a transitive dependency on electron-builder internals | Rejected — too much CI complexity for this sprint; can be revisited if Linux auto-update becomes a priority |

## Open Questions

1. Is the macOS build currently notarized/code-signed in CI? If not, Squirrel.macOS auto-update
   will fail silently. The notification toast would still work but the "Install now" button
   would be macOS-only and only function in signed production builds.
2. Should the toast include a "What's new?" link that opens the release notes on GitHub, or
   just the version number?
3. Should "Remind me later" mean "don't show again for this session" or "don't show again for
   24 hours" (persisted with a timestamp)?
