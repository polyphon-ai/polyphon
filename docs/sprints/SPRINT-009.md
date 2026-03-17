# Sprint 009: GitHub API Response Hardening

## Sprint Theme

**Treat external release data as untrusted input, even when it comes from a familiar API.**

---

## Overview

Polyphon's in-app update checker fetches the latest release from the GitHub Releases API,
extracts `tag_name`, strips a leading `v`, and passes the result into `isNewerVersion()`,
`cachedUpdateInfo`, and across the renderer IPC boundary. Today that path performs one
null-coalesce on `tag_name` but otherwise trusts the response shape entirely. A pre-release
suffix, an oversized string, a missing field, or an unexpected type would flow unvalidated into
main-process cache, the `UPDATE_AVAILABLE` IPC event, and eventually the
`dismissed_update_version` write in the `user_profile` table.

This sprint closes that gap with one strict `parseReleaseVersion(payload: unknown)` helper in
`updateChecker.ts`. The helper validates the three fields consumed downstream (`draft`,
`prerelease`, `tag_name`) before any version string reaches further code. Both
`checkForUpdate()` and `checkForUpdateNow()` are updated to use it. A one-line fix anchors
`VERSION_PATTERN` in `ipc/index.ts` to require exact semver, closing a separate loose-regex
gap on the dismissal write path. Both regexes use the same pattern (`/^\d+\.\d+\.\d+$/`);
the constant is defined in `updateChecker.ts` and the IPC handler uses the same literal to
keep them in sync.

Unit tests cover the malformed-input matrix through both check functions via mocked fetch;
the helper is not exported.

---

## Use Cases

1. **Valid stable release passes through unchanged** — GitHub returns
   `{ tag_name: "v1.2.3", draft: false, prerelease: false }`; Polyphon normalizes to `1.2.3`,
   confirms it is newer, caches it, and emits `IPC.UPDATE_AVAILABLE`.
2. **Oversized tag is rejected before processing** — `tag_name` > 30 characters fails the
   length cap; no stripping or version comparison runs.
3. **Pre-release suffix is rejected** — `v1.2.3-beta`, `1.2.3+build`, `1.2.3.4` all fail
   the strict regex; no update is surfaced.
4. **Missing or non-boolean draft/prerelease fields fail closed** — if either field is absent
   or is not a runtime boolean, the payload is rejected; no update is surfaced.
5. **Null or non-string `tag_name` is guarded** — `null`, `undefined`, or a number all fail
   the string check; no crash.
6. **Dismissal rejects suffixed versions** — renderer sends `"1.2.3-beta"` to `UPDATE_DISMISS`;
   the anchored `VERSION_PATTERN` rejects it; DB write does not occur.
7. **Malformed manual check preserves stale cache** — `checkForUpdateNow()` with a malformed
   response returns `null` without clearing a previously valid `cachedUpdateInfo`; transient API
   errors do not suppress visible update notifications.

---

## Architecture

```
GitHub Releases API response (untrusted JSON)
    ↓ response.ok ? response.json() as unknown : return null/void
unknown payload
    ↓ parseReleaseVersion(payload)
          ├── payload is non-null object?           else → null
          ├── typeof draft === 'boolean'?            else → null
          ├── typeof prerelease === 'boolean'?       else → null
          ├── draft || prerelease?                   → null
          ├── typeof tag_name === 'string'?          else → null
          ├── tag_name.length <= 30?                 else → null
          ├── strip leading 'v' (one char only)
          └── /^\d+\.\d+\.\d+$/ test?               else → null
validated "X.Y.Z" | null
    ├── null  → return early (no cache/IPC mutation)
    └── "1.2.3"
         ↓ isNewerVersion(currentVersion, "1.2.3")
         ↓ dismissal / cooldown checks (startup path only)
         ↓ cachedUpdateInfo = { version: "1.2.3" }
         ↓ win.webContents.send(IPC.UPDATE_AVAILABLE, { version: "1.2.3" })

src/main/ipc/index.ts
    └── VERSION_PATTERN = /^\d+\.\d+\.\d+$/   (was: /^\d+\.\d+\.\d+/)
```

**Constants (module-level in `updateChecker.ts`):**
```ts
const MAX_TAG_NAME_LENGTH = 30;
const STRICT_VERSION_RE = /^\d+\.\d+\.\d+$/;
```

**Helper signature:**
```ts
function parseReleaseVersion(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const r = payload as Record<string, unknown>;
  if (typeof r.draft !== 'boolean') return null;
  if (typeof r.prerelease !== 'boolean') return null;
  if (r.draft || r.prerelease) return null;
  if (typeof r.tag_name !== 'string') return null;
  if (r.tag_name.length > MAX_TAG_NAME_LENGTH) return null;
  const version = r.tag_name.startsWith('v') ? r.tag_name.slice(1) : r.tag_name;
  return STRICT_VERSION_RE.test(version) ? version : null;
}

// Test isolation — reset module-level cache between tests
export function _resetForTests(): void { cachedUpdateInfo = null; }
```

**Call site pattern (both functions):**
```ts
const data = await response.json() as unknown;   // was: as GitHubRelease
const latestVersion = parseReleaseVersion(data);
if (!latestVersion) return null; // or return;
// ... proceed with comparison and side effects
```

---

## Implementation Plan

### P0: Must Ship

**Files:**
- `src/main/utils/updateChecker.ts`
- `src/main/utils/updateChecker.test.ts` (new)
- `src/main/ipc/index.ts`
- `src/main/ipc/handlers.integration.test.ts`

**Tasks:**

#### 1. `src/main/utils/updateChecker.ts`

- [ ] Add `MAX_TAG_NAME_LENGTH = 30` and `STRICT_VERSION_RE = /^\d+\.\d+\.\d+$/` as
      module-level constants
- [ ] Add `parseReleaseVersion(payload: unknown): string | null` local helper (not exported)
      implementing the validation chain above:
      - Non-null object guard
      - `typeof draft === 'boolean'` guard (missing → return null)
      - `typeof prerelease === 'boolean'` guard (missing → return null)
      - Skip if `draft === true` or `prerelease === true`
      - `typeof tag_name === 'string'` guard
      - `tag_name.length > 30` check before stripping
      - Strip single leading `v`
      - Strict semver regex test
- [ ] Add `export function _resetForTests(): void { cachedUpdateInfo = null; }` for
      test isolation (same pattern as `_resetForTests` in `fieldEncryption.ts`)
- [ ] Update `checkForUpdateNow()`:
      - Change `await response.json() as GitHubRelease` to `await response.json() as unknown`
      - Replace `if (release.draft || release.prerelease) return null;` + `rawTag`/`latestVersion`
        block with: `const latestVersion = parseReleaseVersion(data); if (!latestVersion) return null;`
      - Remove the now-unused `GitHubRelease` interface (or keep as dead documentation — see P1)
- [ ] Update `checkForUpdate()` identically
- [ ] Add threat model comment above `parseReleaseVersion`: explain this is the single fetch-layer
      gate; downstream code (`isNewerVersion`, cache, IPC) only ever sees a validated `X.Y.Z` string

#### 2. `src/main/utils/updateChecker.test.ts` (new)

**Helper unit tests (`parseReleaseVersion` tests — export it only for testing if needed, or
test through the public functions with fetch mock):**

Via mocked-fetch behavior tests, cover the full matrix. Organize as two `describe` blocks:

**`describe('parseReleaseVersion')`** — test via `checkForUpdateNow()` with a minimal mock or
by extracting the helper to a named export with `@internal` comment:
  - `null` payload → no update
  - `undefined` payload → no update
  - Non-object (number `42`) → no update
  - `draft: true` → no update
  - `prerelease: true` → no update
  - `draft` missing (not a boolean) → no update
  - `prerelease` missing (not a boolean) → no update
  - `tag_name: null` → no update
  - `tag_name: 123` → no update
  - `tag_name` > 30 chars → no update
  - `"v1.2.3-beta"` → no update
  - `"v1.2.3+build"` → no update
  - `"1.2.3.4"` → no update
  - `"abc"` → no update
  - `"1.2.3 "` (trailing space) → no update
  - `"v1.2.3"` → returns `"1.2.3"` (valid, no-v-prefix variant too)
  - `"1.2.3"` (no prefix) → returns `"1.2.3"`

**`describe('checkForUpdateNow')`** (mocked `fetch`, mocked `app.getVersion`, mock `BrowserWindow`):
  - Non-200 response → returns `null`; no `webContents.send` call
  - `response.json()` throws → returns `null`; no crash
  - Valid newer release (`v1.2.3`) → returns `{ version: '1.2.3' }`; `webContents.send` called
  - Valid but not-newer release → returns `null`; **`getCachedUpdateInfo()` returns `null`**
    (regression guard: `checkForUpdateNow` sets `cachedUpdateInfo = null` when not newer)
  - Malformed tag (pre-release suffix) → returns `null`; `webContents.send` NOT called;
    `getCachedUpdateInfo()` remains `null`
  - Null `tag_name` → returns `null`; no side effects
  - **Stale-cache preservation**: seed `cachedUpdateInfo` via a prior valid check; then call
    with a malformed payload; assert `getCachedUpdateInfo()` still equals the seeded value
  - Use `_resetForTests()` in `beforeEach` to reset module-level cache

**`describe('checkForUpdate')`** (in-memory `DatabaseSync`, seeded `user_profile`):
  - Non-200 → returns without setting cache or sending IPC
  - Valid newer release → sets cache, sends IPC
  - Malformed tag → returns without side effects
  - `POLYPHON_E2E` set → early return (existing behavior, confirm unchanged)

#### 3. `src/main/ipc/index.ts`

- [ ] Change `VERSION_PATTERN = /^\d+\.\d+\.\d+/` to `VERSION_PATTERN = /^\d+\.\d+\.\d+$/`

#### 4. `src/main/ipc/handlers.integration.test.ts`

- [ ] Add to the existing `UPDATE_DISMISS` `describe` block:
  - `it('rejects version with pre-release suffix')` — `'1.2.3-beta'` → DB not updated
  - `it('rejects version with extra dot segment')` — `'1.2.3.4'` → DB not updated
  - `it('still accepts valid exact semver')` — `'1.2.3'` → DB updated (regression guard)

### P1: Ship If Capacity Allows

- [ ] Factor the GitHub Releases API URL to a module-level constant in `updateChecker.ts`
      for slightly cleaner test setup and readability

### Deferred

- **Pre-release update channel** — exact `X.Y.Z` only; pre-release suffixes intentionally excluded
- **Generic runtime schema validator** — unnecessary abstraction for one three-field shape
- **`dismissed_update_version` read-path validation** — the field is only written via the now-validated
  IPC path; read-side validation would be redundant

---

## Files Summary

| File | Action | Purpose |
|------|--------|---------|
| `src/main/utils/updateChecker.ts` | Modify | Add `parseReleaseVersion` helper, `_resetForTests`, fix both check functions |
| `src/main/utils/updateChecker.test.ts` | Create | Unit tests for helper and both check functions |
| `src/main/ipc/index.ts` | Modify | Anchor `VERSION_PATTERN` to exact semver |
| `src/main/ipc/handlers.integration.test.ts` | Modify | Extend UPDATE_DISMISS tests for anchored regex |

---

## Definition of Done

**Fetch-layer validation:**
- [ ] `parseReleaseVersion` returns `null` for `null`, non-object, missing fields, non-boolean
      `draft`/`prerelease`, non-string `tag_name`, `tag_name > 30` chars, pre-release suffixes,
      build metadata, extra dot segments
- [ ] `parseReleaseVersion` returns `'1.2.3'` for both `'v1.2.3'` and `'1.2.3'`
- [ ] Both `checkForUpdate()` and `checkForUpdateNow()` use `parseReleaseVersion`
- [ ] `response.json() as unknown` (not `as GitHubRelease`) at both call sites
- [ ] Invalid payloads never reach `isNewerVersion()`, never set `cachedUpdateInfo`,
      never trigger `IPC.UPDATE_AVAILABLE`
- [ ] Malformed manual checks do not clear a previously valid `cachedUpdateInfo` (stale-cache
      preservation test: seed cache → malformed response → cache value unchanged)
- [ ] `checkForUpdateNow()` with a valid but not-newer response still sets `cachedUpdateInfo = null`
      (regression guard: existing behavior preserved)

**Dismissal validation:**
- [ ] `VERSION_PATTERN` in `index.ts` is `/^\d+\.\d+\.\d+$/`
- [ ] `update:dismiss('1.2.3', true)` writes to DB (regression guard)
- [ ] `update:dismiss('1.2.3-beta', true)` does not write to DB
- [ ] `update:dismiss('1.2.3.4', true)` does not write to DB

**Test isolation:**
- [ ] `_resetForTests()` exported from `updateChecker.ts`; called in `beforeEach`

**Tests:**
- [ ] `updateChecker.test.ts` covers full malformed-input matrix; valid control case passes
- [ ] `handlers.integration.test.ts` extended with 3 new UPDATE_DISMISS assertions
- [ ] `make test-unit` passes
- [ ] `make test-integration` passes

**Scope:**
- [ ] No new npm dependencies
- [ ] No schema changes
- [ ] No renderer changes
- [ ] `npm run typecheck` (if available) or `make test-unit` (TypeScript compiled as part of tests)

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Helper rejects legitimate production tags | Low | Medium | Test `v1.2.3` and `1.2.3` as explicit DoD items; valid cases listed in tests |
| One check function missed; the other still has old code | Low | Medium | Both functions are updated; DoD requires both; unit tests cover both entry points |
| `cachedUpdateInfo` module state leaks between tests | Medium | Low | `_resetForTests()` in `beforeEach` |
| Anchored `VERSION_PATTERN` breaks existing integration test expectations | Low | Low | Existing tests only use `'1.2.3'` which still passes; DoD includes regression guard |
| `as unknown` cast masks a useful compile-time shape assumption | Low | Low | Runtime validation provides equivalent (and stronger) safety at the parse boundary |

---

## Security Considerations

- **External data treated as untrusted**: GitHub is a trusted service, but the JSON payload
  is still a runtime boundary. TypeScript casts do not validate at runtime; `parseReleaseVersion`
  does.
- **Validation before all side effects**: version comparison, cache mutation, IPC send, and
  eventual DB dismissal writes all depend on a strictly validated `X.Y.Z` string. No malformed
  value can reach any of these paths after this sprint.
- **Intentionally narrow semver subset**: stable release updates only accept exact `X.Y.Z`.
  This matches existing release-tag conventions and removes pre-release ambiguity.
- **Defense in depth**: fetch-layer validation (`updateChecker.ts`) + dismissal write validation
  (`VERSION_PATTERN` in `index.ts`) provide two independent checks across the full version
  string lifecycle.
- **No new attack surface**: no new IPC channels, no new network calls, no schema changes.

---

## Observability & Rollback

**Post-ship verification:**
- `make test-unit` → `updateChecker.test.ts` passes with full matrix
- `make test-integration` → extended `UPDATE_DISMISS` integration cases pass
- Manual smoke: run app with update check active; confirm normal update flow unchanged

**Rollback:**
Remove `parseReleaseVersion`, `_resetForTests`, and the `as unknown` change from
`updateChecker.ts`. Restore `VERSION_PATTERN`. Remove new tests. No schema changes, no
migrations, no persisted data format changes — full revert in one commit.

---

## Documentation

- Inline comment above `parseReleaseVersion` in `updateChecker.ts` explaining the validation
  contract and why it lives here (not in `validate.ts`)
- No `CLAUDE.md` update required — fetch-boundary validation is analogous to the IPC validation
  convention already documented; the pattern is now self-evident from the codebase

---

## Dependencies

- Builds on Sprint 003 (update notification architecture — `isNewerVersion`, `cachedUpdateInfo`)
- Reinforces Sprint 005 (IPC input validation) and Sprint 008 (function-level guards) patterns
- No new npm dependencies

---

## Open Questions

None. All design decisions resolved during orientation, interview, and synthesis.

---

## Devil's Advocate and Security Critiques Addressed

| Critique | Source | Action |
|---|---|---|
| "Validates entire payload shape" overstates a partial guard | DA | Wording fixed: "validates the three consumed fields" |
| DoD missing stale-cache preservation test | DA | Added DoD item: seed cache → malformed response → cache unchanged |
| DoD missing regression for `checkForUpdateNow` not-newer cache clear | DA | Added DoD item as explicit regression guard |
| Testing strategy ambiguous about helper export | DA | Clarified: helper is not exported; tested via public functions with mocked fetch |
| Two regexes (`STRICT_VERSION_RE` and `VERSION_PATTERN`) can drift | DA | Overview now notes both use `/^\d+\.\d+\.\d+$/`; DoD lists both |
| "All design decisions resolved" is overconfident | DA | **Rejected** — the seed prompt specifies exact requirements; conservative policy confirmed by the conductor |
| MAX_TAG_NAME_LENGTH = 30 is arbitrary | DA | **Rejected** — explicitly specified in the seed; annotated in code |
| Exact `X.Y.Z` is a policy decision snuck in as security | DA | **Rejected** — this is the stated requirement; the hardening scope exactly matches the seed |
| Read-side validation of `dismissed_update_version` | DA | **Noted in Deferred** — acknowledged; pre-Sprint 009 writes used loose validation; edge case tracked |
| Exporting `_resetForTests` is a smell | DA | **Rejected** — same pattern used in `fieldEncryption.ts`; established repo convention |
| Production diagnostics missing from DoD | DA | **Rejected** — project policy silences packaged-build logs by design (CLAUDE.md) |
| All security findings | Security review | Low; no DoD changes required
