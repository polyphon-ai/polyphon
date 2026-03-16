# Sprint 003: In-App Update Notifications Without Auto-Install

## Sprint Goal

Add a lightweight release-notification flow so Polyphon can detect newer GitHub releases on app
startup, surface them in a minimal in-app banner, and respect both short-term and per-release
dismissal preferences across restarts.

## Sprint Theme

Awareness first, installation second. This sprint is about making new releases visible and
non-annoying without taking on the platform-specific complexity of auto-update or in-app
installation.

## Background

Polyphon already publishes desktop builds to `polyphon-ai/releases` through the existing GitHub
Actions release pipeline. The app does not currently check for newer releases or tell the
conductor when they are available.

The original sprint intent asked two questions:

1. Can the app check for newer releases and notify the user at startup?
2. Should we also adopt an Electron-standard in-app installation path?

Interview follow-up resolves the second question for this sprint: we are **not** shipping
Squirrel/update-electron-app or any in-app auto-install flow right now. All platforms will use
the same outcome: a `Download` link that opens the GitHub releases page in the browser.

The follow-up also clarifies banner behavior:

- `Remind me later` means a **24-hour cooldown**, persisted in SQLite
- `Don't remind me again for this release` means the specific newer version stays dismissed until
  an even newer release appears
- The banner should stay minimal: version number + `Remind me later` + `Don't remind me again for
  this release` + `Download`

## Product Context

Polyphon is a local-first Electron app. This sprint should preserve that model:

- update checks happen in the main process
- SQLite remains main-process only
- the renderer learns about release state through IPC
- no telemetry or analytics are added
- startup should not block on network I/O

Relevant implementation areas:

- `src/main/index.ts` — trigger the async update check after the main window is shown
- `src/main/ipc/index.ts` — register new update IPC handlers
- `src/main/preload.ts` — expose update APIs to the renderer
- `src/main/db/schema.ts` — add persisted release-notification preference storage
- `src/main/db/migrations/` — add a numbered migration and bump schema version
- `src/shared/constants.ts` — new IPC channel names
- `src/shared/types.ts` — shared release/update data shapes
- `src/renderer/store/uiStore.ts` — banner state and actions
- `src/renderer/App.tsx` — render the global update banner near the root layout
- `.github/workflows/release.yml` — confirm current release source remains GitHub Releases only

## In Scope

- Check GitHub Releases for the latest available version after app startup
- Compare the current app version against the latest release version
- Show a minimal global banner when a newer release is available
- Persist a 24-hour `Remind me later` cooldown in SQLite
- Persist a per-release `Don't remind me again` dismissal in SQLite
- Open the releases page in the system browser from the banner
- Skip the update check in e2e/test mode via existing environment signals
- Add unit and integration coverage for version comparison, persistence rules, and IPC behavior

## Out of Scope

- `update-electron-app`
- Squirrel-based auto-update
- auto-downloading installers
- silent background installs
- release notes UI
- a general-purpose toast/notification framework
- extra settings UI for update preferences beyond the banner actions

## Primary Outcomes

By the end of the sprint we should have:

1. A non-blocking startup update check against `polyphon-ai/releases`
2. A minimal global banner when a newer version exists
3. A persisted 24-hour cooldown for `Remind me later`
4. A persisted per-release dismissal for `Don't remind me again for this release`
5. A consistent `Download` path across macOS, Windows, and Linux

## Deliverables

### 1. Main-process release check

Implement a main-process service or utility that:

- fetches the latest GitHub release from the public releases repo
- extracts the release version in a format the app can compare safely
- returns no banner state when the current version is already latest
- is skipped entirely when `POLYPHON_E2E=1`

### 2. Persistent notification preferences

Add SQLite-backed persistence for release notification state, covering:

- latest version last dismissed with `Don't remind me again`
- cooldown-until timestamp for `Remind me later`

This state should be evaluated against the latest available release, not just the current app
version, so the banner reappears when a newer release supersedes a previously dismissed one.

### 3. Minimal renderer banner

Render a single global banner that includes only:

- the newer version number
- `Remind me later`
- `Don't remind me again for this release`
- `Download`

The banner should sit above normal view content and should not require a reusable toast system.

### 4. Test coverage

Add tests for:

- version comparison and release parsing
- cooldown logic
- per-release dismissal logic
- IPC handlers for checking and updating release-notification state
- renderer/store behavior for showing and dismissing the banner

## Workstreams

### Workstream A: Release discovery

Build the GitHub release fetch and version comparison path in the main process, keeping it
asynchronous and easy to disable in test environments.

### Workstream B: Preference persistence

Add a small SQLite-backed persistence model for update-notification preferences, including both
24-hour snooze behavior and per-release dismissal behavior.

### Workstream C: Banner UI

Add a minimal banner to the root renderer layout and wire it to the new IPC/update state flow.

### Workstream D: Test and failure-path hardening

Make the feature safe under offline startup, GitHub API failure, malformed release tags, and e2e
test runs with no network access.

## Implementation Plan

### P0: Must Ship

**Release check behavior**

- [ ] Fetch the latest release from `polyphon-ai/releases` using a plain HTTPS request from the main process
- [ ] Trigger the check only after the main window is visible so startup stays responsive
- [ ] Parse GitHub release version/tag data into a normalized comparable version
- [ ] Compare the current app version from `app.getVersion()` against the latest available release
- [ ] Skip the check entirely when `POLYPHON_E2E=1`
- [ ] Fail quietly when the network request or parsing fails; absence of update data should not block normal app use

**Persistence model**

- [ ] Add a new numbered migration under `src/main/db/migrations/` and bump `SCHEMA_VERSION`
- [ ] Extend `CREATE_TABLES_SQL` so fresh installs get the new release-notification table
- [ ] Store enough data to answer:
- [ ] which release version is permanently dismissed
- [ ] until what timestamp the update banner is snoozed
- [ ] Treat `Remind me later` as `Date.now() + 24 hours`
- [ ] Treat `Don't remind me again for this release` as a dismissal keyed to the available newer version
- [ ] Ensure a newly published later version is not blocked by an older version's dismissal record

**IPC and shared types**

- [ ] Add shared types for latest-release data and banner state
- [ ] Add IPC channels for:
- [ ] fetching current update-banner state
- [ ] recording `Remind me later`
- [ ] recording `Don't remind me again for this release`
- [ ] opening the releases page can continue to use the existing `shell.openExternal` path with an allowed GitHub URL
- [ ] Expose the update API through `src/main/preload.ts`

**Renderer banner**

- [ ] Extend `uiStore` or equivalent root-level renderer state with update-banner data
- [ ] On app load, request update state asynchronously from the main process
- [ ] Render a minimal global banner in `App.tsx` only when a newer version is available and not suppressed
- [ ] Show the new version number prominently in the banner copy
- [ ] Wire `Remind me later` to persist the 24-hour cooldown and immediately hide the banner
- [ ] Wire `Don't remind me again for this release` to persist the release-specific dismissal and immediately hide the banner
- [ ] Wire `Download` to open the GitHub releases page in the browser

**Testing**

- [ ] Add unit tests for semantic version comparison and tag normalization
- [ ] Add integration tests for the new SQLite query/IPC flow using `:memory:`
- [ ] Add renderer/store tests for banner visibility and action handling
- [ ] Confirm existing e2e coverage still passes with the update check disabled in test mode

### P1: Ship If Capacity Allows

- [ ] Include release name metadata in the internal update type even if the first banner only shows the version number
- [ ] Add a small reusable utility for GitHub-release fetching if it improves testability without introducing a broader abstraction
- [ ] Add one manual verification note to docs or release QA notes describing how to force the banner in a local build

### Deferred

- **In-app install or restart flows**
- **Auto-download**
- **Platform-specific updater dependencies**
- **Release notes preview**
- **Settings-level controls for update policy**
- **Background periodic polling after startup**

## Files Summary

| File | Action | Purpose |
|------|--------|---------|
| `src/main/index.ts` | Update | Kick off the async release check after window creation/show |
| `src/main/ipc/index.ts` | Update | Register update-related IPC handlers |
| `src/main/preload.ts` | Update | Expose update APIs to the renderer |
| `src/main/db/schema.ts` | Update | Add release-notification preference table and bump schema version |
| `src/main/db/migrations/index.ts` | Update | Register new migration |
| `src/main/db/migrations/002_*.ts` | Create | Apply schema change for existing installs |
| `src/main/db/queries/` | Create or update | Query helpers for release-notification preferences |
| `src/shared/constants.ts` | Update | Add update IPC channel constants |
| `src/shared/types.ts` | Update | Add shared update/release types |
| `src/renderer/store/uiStore.ts` | Update | Hold banner state and actions |
| `src/renderer/App.tsx` | Update | Render minimal global banner |
| `src/main/ipc/*.integration.test.ts` | Update | Cover persistence and IPC behavior |
| `src/renderer/store/*.test.ts` or `src/renderer/App.test.tsx` | Update | Cover banner visibility and actions |

## Acceptance Criteria

### Banner behavior

- When a newer release exists, the app shows a minimal banner with the newer version number
- The banner includes exactly the user actions agreed in interview follow-up:
- `Remind me later`
- `Don't remind me again for this release`
- `Download`
- `Download` opens the GitHub releases page in the browser on all supported platforms

### Persistence behavior

- `Remind me later` suppresses the banner for 24 hours across app restarts
- The snooze is persisted in SQLite, not in renderer-only state
- `Don't remind me again for this release` suppresses only that newer version across restarts
- If an even newer release becomes available later, the banner reappears

### Platform behavior

- macOS, Windows, and Linux all use the same browser-based download path this sprint
- No platform attempts in-app install or auto-update

### Reliability behavior

- App startup is not blocked by the update check
- Offline startup does not produce a crash or noisy error state
- E2E and integration tests do not require real network access

## Verification Plan

Manual verification:

- run the app on a build whose version is lower than the latest GitHub release and confirm the banner appears
- click `Remind me later`, restart the app, and confirm the banner does not reappear within 24 hours
- advance the persisted snooze timestamp or wait past the threshold and confirm the banner returns
- click `Don't remind me again for this release`, restart the app, and confirm the banner stays hidden for that same release version
- simulate a newer release version than the dismissed one and confirm the banner appears again
- click `Download` and confirm the releases page opens externally

Automated verification:

- unit tests for version parsing/comparison
- integration tests for migration, persistence, and IPC
- renderer tests for banner visibility and dismissal actions
- existing e2e suite passes with `POLYPHON_E2E=1`

## Risks

- Medium risk that GitHub release tags are not perfectly normalized for direct version comparison
- Low risk that a too-generic persistence model becomes harder to reason about than a purpose-built release-notification table
- Medium risk that banner state drifts if fetch, persistence, and renderer logic are split across too many layers
- Low risk that GitHub API failures create noisy logs or flaky tests if failure handling is not quiet by default

## Mitigations

- Normalize and test tag/version parsing with representative release-tag fixtures
- Keep the persistence model narrow and release-focused rather than building a generalized notifications system
- Centralize banner eligibility logic in the main process or a shared utility with clear tests
- Gate network access behind the existing e2e environment flag and treat fetch failures as no-op

## Open Questions

These do not block the sprint draft, but they are the remaining implementation choices:

1. Should the GitHub API request use `/releases/latest` only, or do we need additional filtering for prereleases/drafts based on how `polyphon-ai/releases` is managed?
2. Should the persistence table keep only one row of latest update preference state, or a small history keyed by release version for easier debugging?
3. What exact banner copy should surround the version number while still staying intentionally minimal?

## Definition of Done

Sprint 003 is done when:

- the app checks `polyphon-ai/releases` asynchronously after startup
- a newer release produces a minimal global banner in the renderer
- the banner includes the newer version number, `Remind me later`, `Don't remind me again for this release`, and `Download`
- `Remind me later` persists a 24-hour cooldown in SQLite
- `Don't remind me again for this release` persists a release-specific dismissal in SQLite
- a later newer release overrides the earlier per-release dismissal and shows the banner again
- `Download` opens the GitHub releases page externally on macOS, Windows, and Linux
- no auto-update or in-app install path is shipped
- offline startup remains safe and quiet
- automated tests cover version logic, persistence behavior, and banner visibility
- the existing e2e suite still runs without network access
