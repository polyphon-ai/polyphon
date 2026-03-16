# Sprint 003 Merge Notes

## Claude Draft Strengths

- Concrete implementation plan with specific file names, task checklists, and IPC channel design
- Correctly models push architecture (`win.webContents.send`) for update notifications
- Two-column persistence design (`dismissed_update_version` + `update_remind_after`) in `user_profile`
- Pre-release filtering (filter on `prerelease: false` from GitHub API, `/releases/latest` is already stable-only)
- Explicit `POLYPHON_E2E` test guard for update checker
- Dedicated `UpdateBanner` component (not inlined into App.tsx)
- Version comparison utility as a standalone testable module

## Claude Draft Weaknesses (from Codex critique)

- **Scope inconsistency**: `Overview` and `Architecture` still referenced `update-electron-app` /
  Squirrel / "Install now" button even though the interview selected "no auto-install." The plan
  was partially updated but not fully reconciled.
- **"Remind me later" inconsistency**: `Overview` and `Use Cases` said "session-only" / "reappears
  next startup" while `Architecture`, `IPC channels`, and `DoD` said "24-hour cooldown in SQLite."
  Interview answer is 24-hour cooldown — must be consistent everywhere.
- **IPC startup race**: pure push model (`update:available` event) can be dropped if the main
  process finishes the update check before the renderer's `onAvailable` listener is registered.
  Need a `getUpdateState()` invoke endpoint so the renderer can pull state on mount as a fallback.
- **Migration filename inconsistency**: `002_add_dismissed_update_version.ts` (tasks section) vs.
  `002_add_update_preferences.ts` (files table). Minor, but must be consistent.
- **Test plan thin on failure cases**: missing tests for malformed tags, rate-limit responses, first
  run with empty DB, duplicate listener mounts, and the startup race.
- **Schema choice under-argued**: `user_profile` vs. separate table was implied, not justified.

## Codex Draft Strengths

- "Awareness first, installation second" theme — excellent scope framing
- Explicit DoD criterion: "a later newer release overrides earlier per-release dismissal"
- Well-organized workstreams (A: discovery / B: persistence / C: banner / D: hardening)
- Thorough manual verification checklist (advance snooze timestamp, simulate newer version)
- Correctly noted that `/releases/latest` already filters pre-releases and drafts

## Codex Draft Weaknesses (from Claude critique)

- Persistence model left as an open question (single row vs. separate table) — resolved: use `user_profile`
- IPC model left vague ("fetch current update-banner state") — resolved: push + fallback invoke
- No named component file for the banner — resolved: `UpdateBanner.tsx`
- No named version utility file — resolved: `src/main/utils/version.ts`
- Open Questions 2 and 3 were unnecessary (single row is obvious; banner copy is obvious)

## Valid Critiques Accepted

1. **Remove all auto-install residue from Overview/Architecture** — Claude's mid-sprint edits were
   incomplete; the merged draft must be fully notification-only with no Squirrel/autoUpdater/
   update-electron-app references anywhere
2. **Unify "Remind me later" as 24-hour cooldown everywhere** — no more "session-only" language
3. **Add `update:get-state` invoke endpoint** — renderer calls this on mount to get current update
   state; main process returns it synchronously from the DB (plus any cached check result);
   eliminates the startup race
4. **Expand test plan** — add failure cases: malformed tags, rate limit (429/error), first run,
   listener cleanup, startup race coverage
5. **Justify schema choice** — `user_profile` is correct because it's a single-user preference;
   a dedicated table would be over-engineered for two fields with no join requirement

## Critiques Rejected

- **Codex's request-plus-action IPC model** (`update:get-state` + `update:remind-later` +
  `update:dismiss-release`): Partially accepted (add `update:get-state`); but keeping the push
  model for the initial notification is still correct and matches the existing streaming pattern.
  Merge: push model + `update:get-state` fallback on mount.
- **Separate update preferences table**: Rejected — `user_profile` is the correct home for
  user-level preferences; no join needed; keeps migration surface small.

## Interview Refinements Applied

1. Skip Squirrel/update-electron-app entirely — all platforms use "Download" link
2. "Remind me later" = 24-hour cooldown persisted in SQLite
3. Banner is minimal: version number + three actions only (no "What's new?" link)

## Final Decisions

| Decision | Choice | Reason |
|---|---|---|
| Auto-install | Deferred | No code signing; all platforms use Download link |
| "Remind me later" | 24h cooldown in SQLite | Interview decision; more user-friendly |
| Persistence location | `user_profile` columns | Single-user preference; no join needed; minimal migration |
| IPC model | Push + `update:get-state` fallback | Avoids startup race; consistent with existing IPC patterns |
| Pre-release filter | `/releases/latest` endpoint | Already returns stable releases only |
| Banner copy | "Polyphon v{X} is available" | Minimal; resolved open question |
| New npm deps | None | `fetch` is built-in to Node/Electron |
| Migration file | `002_add_update_preferences.ts` | Covers both new columns |
