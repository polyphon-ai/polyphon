# Sprint 011: Conductor Avatar Upload Hardening

## Sprint Theme

**Make the avatar flow explicitly safe, not just incidentally safe.**

---

## Overview

Polyphon's conductor avatar flows through two IPC handlers, across the IPC boundary, into the
`user_profile` encrypted table, and back into the React renderer. A full audit of that path
found three of the four original checks already hold — but two gaps remain where implicit
behavior (silent nativeImage failure, loose string validation) leaves the flow relying on
circumstance rather than explicit enforcement.

This sprint closes those gaps with two targeted additions:

1. **`img.isEmpty()` guard** — both `uploadConductorAvatar` and `pickAvatarFile` call
   `nativeImage.createFromPath()` without verifying the image actually decoded. A file with
   an allowed extension but non-image content (e.g., a `.jpg` that is actually a text
   document) currently reaches the PNG conversion path and fails implicitly. Adding
   `if (img.isEmpty()) return null` before any resize or DB write makes rejection explicit
   and testable.

2. **Data URI shape validation on save** — `requireUserProfileShape()` currently accepts
   any string up to 500KB for `conductorAvatar`. A renderer-injected filesystem path (e.g.,
   `/etc/passwd`) would pass and be stored. The fix adds `requireAvatarValue()` — a small
   helper that accepts either an empty string (avatar removal) or a string matching
   `IMAGE_DATA_URI_RE` — and uses it in `requireUserProfileShape()`.

Both fixes are additive, follow established Sprint 005/008 patterns (validate at the
boundary, function-level guards), require no schema changes, and leave renderer behavior
unchanged.

**Note on relative paths**: the seed prompt asks to confirm the stored value is "a data URI
or a safe relative path." The current handlers produce only `data:image/png;base64,...` data
URIs — relative paths are not currently generated or consumed anywhere in the avatar flow.
Accepting relative paths would widen the persistence contract for no current benefit and
introduce a harder-to-validate case. This sprint narrows to data URI or empty string only.

---

## Audit Findings

| Check | Result | Evidence |
|---|---|---|
| File picker restricts to image extensions | ✅ Pass | Both handlers: `dialog.showOpenDialog({ filters: [{ extensions: ['jpg','jpeg','png','gif','webp'] }] })` |
| No file path leaks to renderer | ✅ Pass | Both handlers convert via `nativeImage` → `toPNG()` → base64 data URI; the OS-supplied file path never crosses the IPC boundary |
| Stored value is data URI, not filesystem path | ✅ Pass (gap on save) | Handlers produce only data URIs; but `requireUserProfileShape` does not enforce this format constraint on the `saveUserProfile` IPC path |
| Renderer uses `<img src=...>`, not innerHTML | ✅ Pass | `MessageBubble.tsx:82`, `ConductorPanel.tsx:19`, `SettingsPage.tsx:463` all use `<img src={conductorAvatar}>`. `AvatarEditor.tsx` uses Canvas APIs (no HTML injection). |
| Handler rejects non-image file content | ⚠️ Gap → Fixed | `img.isEmpty()` check absent before resize/toPNG in both handlers |
| Avatar save validates data URI format | ⚠️ Gap → Fixed | `requireUserProfileShape` uses bare `requireString` for `conductorAvatar` |
| Unit test for non-image rejection | ⚠️ Missing → Added | No test covered avatar handler behavior with a non-image file; new integration tests added |

---

## Use Cases

1. **Normal avatar upload succeeds** — conductor selects a valid PNG/JPEG via the OS dialog;
   handler converts to `data:image/png;base64,...`; stored and rendered normally.

2. **Non-image file (renamed or malformed) is rejected early** — conductor selects a file
   with an allowed extension that is not actually an image; `nativeImage.createFromPath`
   returns an empty image; `isEmpty()` fires; handler returns `null`; no DB write.

3. **Renderer-side crop/edit flow stays safe** — conductor picks an image for editing via
   `SETTINGS_PICK_AVATAR_FILE`; main process returns only a PNG data URI to the renderer for
   `AvatarEditor.tsx` to crop; no filesystem path crosses IPC into React state.

4. **Avatar removal still works** — `conductorAvatar: ''` passes `requireAvatarValue`
   (empty string allowed) and clears the stored avatar normally.

5. **Injected filesystem path is rejected at the persistence boundary** — a renderer bug or
   devtools injection attempting `saveUserProfile({ conductorAvatar: '/etc/passwd', ... })`
   is rejected by `requireAvatarValue` before any DB write.

6. **Non-image data URI is rejected** — `data:text/html;base64,...` or
   `data:application/json;base64,...` fails `IMAGE_DATA_URI_RE` and is rejected.

---

## Architecture

```
OS file picker
    ↓ dialog.showOpenDialog({ filters: image extensions })
selected file path (main process only — never returned to renderer)
    ↓ nativeImage.createFromPath(filePaths[0]!)
nativeImage
    ├── isEmpty() === true   → return null (no resize, no toPNG, no DB write)
    └── isEmpty() === false
         ↓ resize or downscale as needed
         ↓ toPNG()
         ↓ data:image/png;base64,...
         ├── uploadConductorAvatar → upsertUserProfile(... conductorAvatar: dataUri) + return dataUri
         └── pickAvatarFile         → return dataUri to renderer → AvatarEditor.tsx (crop/edit)

renderer save path (crop confirm or settings save)
    ↓ IPC.SETTINGS_SAVE_USER_PROFILE
unknown profile payload
    ↓ requireUserProfileShape(profile)
         └── requireAvatarValue(conductorAvatar)
               ├── typeof string + length ≤ MAX_AVATAR
               ├── value === ''                           → accept (avatar removal)
               └── IMAGE_DATA_URI_RE.test(value)         → accept / reject
    ↓ upsertUserProfile(...) [encrypted field]

renderer display (all unchanged)
    MessageBubble.tsx:82   → <img src={conductorAvatar}>
    ConductorPanel.tsx:19  → <img src={conductorAvatar}>
    SettingsPage.tsx:463   → <img src={userProfile.conductorAvatar}>
```

**IMAGE_DATA_URI_RE:**
```ts
const IMAGE_DATA_URI_RE = /^data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]*$/;
```

This regex enforces:
- Correct `data:image/` scheme
- A valid MIME subtype (any image subtype accepted — SVG is low-risk in Electron `<img>`)
- `;base64,` separator
- Base64 character set only

---

## Implementation Plan

### P0: Must Ship

#### 1. `src/main/ipc/validate.ts` — add `requireAvatarValue` + use in `requireUserProfileShape`

**Files:**
- `src/main/ipc/validate.ts`

**Tasks:**
- [ ] Add module-level constant:
  ```ts
  const IMAGE_DATA_URI_RE = /^data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]*$/;
  ```
- [ ] Add `export function requireAvatarValue(value: unknown, name: string): string`:
  - Call `requireString(value, name, MAX_AVATAR)` (type + length)
  - If result is `''`: return `''` (avatar removal allowed)
  - If `!IMAGE_DATA_URI_RE.test(result)`: throw
    `Error(\`${name} must be a valid image data URI or empty string\`)`
  - Return validated string
- [ ] In `requireUserProfileShape`, replace:
  ```ts
  requireString(obj['conductorAvatar'], 'conductorAvatar', MAX_AVATAR);
  ```
  with:
  ```ts
  requireAvatarValue(obj['conductorAvatar'], 'conductorAvatar');
  ```

#### 2. `src/main/ipc/settingsHandlers.ts` — `img.isEmpty()` guard in both handlers

**Files:**
- `src/main/ipc/settingsHandlers.ts`

**Tasks:**
- [ ] In `SETTINGS_UPLOAD_CONDUCTOR_AVATAR` handler (~line 361):
  ```ts
  const img = nativeImage.createFromPath(filePaths[0]!);
  if (img.isEmpty()) return null;  // ← ADD
  const resized = img.resize({ width: 100, height: 100 });
  ```
- [ ] In `SETTINGS_PICK_AVATAR_FILE` handler (~line 380):
  ```ts
  const img = nativeImage.createFromPath(filePaths[0]!);
  if (img.isEmpty()) return null;  // ← ADD
  const size = img.getSize();
  ```
- [ ] Guard must appear before any resize, toPNG, or DB write call in both handlers

#### 3. `src/main/ipc/validate.test.ts` — extend with `requireAvatarValue` tests

**Files:**
- `src/main/ipc/validate.test.ts` (existing file — extend, do not recreate)

**Tasks:**
- [ ] Add `describe('requireAvatarValue')` block:
  - `''` → returns `''` (avatar removal allowed)
  - `'data:image/png;base64,abc'` → accepted
  - `'data:image/jpeg;base64,abc'` → accepted
  - `'data:image/gif;base64,abc'` → accepted
  - `'data:text/html;base64,abc'` → throws "must be a valid image data URI"
  - `'/etc/passwd'` → throws
  - `'https://evil.com/img.png'` → throws
  - `123` (number) → throws "must be a string"
  - String of `MAX_AVATAR + 1` bytes → throws length error
  - `'data:image/png'` (missing `;base64,`) → throws

#### 4. `src/main/ipc/settingsHandlers.integration.test.ts` — avatar handler tests

**Files:**
- `src/main/ipc/settingsHandlers.integration.test.ts` (existing file — extend)

**Tasks:**
- [ ] Add `describe('SETTINGS_UPLOAD_CONDUCTOR_AVATAR')` block:
  - `it('returns null when dialog is canceled')` — mock `dialog.showOpenDialog` to return
    `{ canceled: true, filePaths: [] }` → handler returns `null`
  - `it('returns null when nativeImage is empty (non-image file content)')` — mock dialog to
    return a path; mock `nativeImage.createFromPath` to return `{ isEmpty: () => true }`;
    assert handler returns `null`; assert `upsertUserProfile` is NOT called
  - `it('returns a data URI for a valid image')` — mock dialog + nativeImage with valid
    `toPNG()` bytes; assert result starts with `'data:image/png;base64,'`

- [ ] Add `describe('SETTINGS_PICK_AVATAR_FILE')` block:
  - `it('returns null when dialog is canceled')` — same cancel case
  - `it('returns null when nativeImage is empty (non-image file content)')` — same empty
    image case; assert handler returns `null` (this handler does not write to DB in any case)
  - `it('returns a data URI for a valid image')` — mock nativeImage; assert result starts
    with `'data:image/png;base64,'`

#### 5. `src/main/ipc/settingsHandlers.integration.test.ts` — SAVE_USER_PROFILE avatar shape tests

**Files:**
- `src/main/ipc/settingsHandlers.integration.test.ts` (existing file — extend)

**Tasks:**
- [ ] Extend `SETTINGS_SAVE_USER_PROFILE` describe block with:
  - `it('rejects non-data-URI avatar value')` — `conductorAvatar: '/etc/passwd'` → rejects
  - `it('rejects non-image data URI')` — `conductorAvatar: 'data:text/html;base64,abc'` → rejects
  - `it('accepts valid data URI avatar')` — `conductorAvatar: 'data:image/png;base64,abc'` → saves
  - `it('accepts empty string avatar removal')` — `conductorAvatar: ''` → saves

### P1: Ship If Capacity Allows

### Deferred

- **MIME type sniffing from file bytes** — `nativeImage.createFromPath` + `isEmpty()` is
  the correct content-level guard for a local-first app; byte-level MIME sniffing adds
  complexity for no material gain (we convert everything to PNG anyway).
- **Blocking `data:image/svg+xml` explicitly** — SVG embedded script does not execute in
  Electron's `<img>` tag; the risk is effectively zero; `IMAGE_DATA_URI_RE` accepts SVG by
  design. Revisit only if SVG avatars are ever produced by a handler.
- **Renderer-side pre-validation** — acceptable as a UX nicety (e.g., warn before IPC call)
  but the main-process validation is the authoritative trust boundary.

---

## Files Summary

| File | Action | Purpose |
|------|--------|---------|
| `src/main/ipc/validate.ts` | Modify | Add `IMAGE_DATA_URI_RE`, `requireAvatarValue`; use in `requireUserProfileShape` |
| `src/main/ipc/settingsHandlers.ts` | Modify | Add `img.isEmpty()` guard to both avatar handlers |
| `src/main/ipc/validate.test.ts` | Extend | Add `requireAvatarValue` test describe block |
| `src/main/ipc/settingsHandlers.integration.test.ts` | Extend | Add avatar handler integration tests + save-path avatar shape assertions |

---

## Definition of Done

**`img.isEmpty()` guard:**
- [ ] `SETTINGS_UPLOAD_CONDUCTOR_AVATAR` returns `null` when `img.isEmpty()` is true
- [ ] `SETTINGS_PICK_AVATAR_FILE` returns `null` when `img.isEmpty()` is true
- [ ] Guard appears before resize, toPNG, or DB write in both handlers
- [ ] Integration test confirms `upsertUserProfile` is NOT called for upload handler when guard fires
- [ ] Integration test confirms pick handler returns `null` (no DB write in any case)

**`requireAvatarValue` validator:**
- [ ] Empty string `''` accepted (avatar removal)
- [ ] `data:image/...;base64,...` shape accepted
- [ ] Non-empty, non-data-URI strings rejected: filesystem paths, http URLs, non-image data URIs
- [ ] `data:image/png` without `;base64,` rejected
- [ ] `requireUserProfileShape` uses `requireAvatarValue` for `conductorAvatar`

**Tests:**
- [ ] `validate.test.ts` has ≥10 `requireAvatarValue` cases
- [ ] `settingsHandlers.integration.test.ts` has cancel + empty-image + valid cases for both handlers
- [ ] `settingsHandlers.integration.test.ts` has save-path tests: rejects `/etc/passwd`, rejects
      `data:text/html;base64,...`, accepts `data:image/png;base64,abc`, accepts `''`
- [ ] No existing integration test seed data uses a `conductorAvatar` value that fails `requireAvatarValue`
      (all existing test fixtures use `''`, which is valid)
- [ ] All existing tests pass unchanged
- [ ] `make test-unit` passes
- [ ] `make test-integration` passes

**Scope:**
- [ ] No new npm dependencies
- [ ] No schema changes
- [ ] No renderer changes
- [ ] `npm run typecheck` passes

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| `img.isEmpty()` rejects a valid but unusual image format | Very Low | Low | nativeImage supports all formats the dialog accepts; isEmpty fires only on truly unparseable bytes |
| `IMAGE_DATA_URI_RE` rejects a valid data URI with edge-case charset | Very Low | Low | Regex uses generous character classes for MIME subtype; real-world image data URIs all match |
| Mocking `nativeImage.createFromPath` in integration tests requires existing test seam | Low | Medium | `settingsHandlers.integration.test.ts` already mocks Electron module boundary; same pattern applies |
| Existing `conductorAvatar` values stored before this sprint use valid data URIs | Very Low | None | Both handlers always produced `data:image/png;base64,...`; IMAGE_DATA_URI_RE accepts these |

---

## Security Considerations

- **Defense in depth**: handler guard (returns null for empty/undecodable image) +
  validator (rejects non-data-URI strings on save path) are independent. Either alone is
  sufficient for normal operation; both together make each trust boundary explicit.
- **Filesystem path reflection blocked**: a compromised renderer cannot store an absolute
  filesystem path via `saveUserProfile` because `requireAvatarValue` rejects it. The
  `<img src="/etc/passwd">` scenario is explicitly closed.
- **No new attack surface**: no new IPC channels, no new subprocess paths, no network calls,
  no schema changes.
- **Empty data URI is harmless**: if the isEmpty guard were absent, a non-image file would
  produce `data:image/png;base64,` (empty base64) → a broken image in the UI. Not a security
  issue, but explicit rejection is better than silent failure.

---

## Observability & Rollback

**Post-ship verification:**
- `make test-unit` → `validate.test.ts` `requireAvatarValue` describe block passes
- `make test-integration` → new avatar handler cases pass
- Manual smoke: upload a valid avatar via Settings → appears correctly; attempt to select a
  non-image file (e.g., a `.txt` renamed to `.jpg`) → gracefully returns null / shows
  existing avatar unchanged

**Rollback:**
Remove `IMAGE_DATA_URI_RE` and `requireAvatarValue` from `validate.ts`; restore `requireString`
in `requireUserProfileShape`; remove `isEmpty()` checks from both handlers; remove the new
`requireAvatarValue` describe block from `validate.test.ts`; remove new avatar describe blocks
from `settingsHandlers.integration.test.ts`. No schema changes, no migrations, no persisted
data format changes — full revert in one commit.

---

## Documentation

- [ ] Comment above `requireAvatarValue` in `validate.ts` explaining: two valid states are
      empty string (avatar removed) and `data:image/...;base64,...` (produced by avatar
      handlers); relative paths are not accepted because no handler currently generates them
      and widening the contract would add complexity for no current benefit.
- [ ] No `CLAUDE.md` update needed — IPC validation pattern (Sprint 005) and function-level
      guard pattern (Sprint 008) already documented; this sprint is an application of both.

---

## Dependencies

- Builds on Sprint 005 (IPC validation — `requireString`, `MAX_AVATAR`)
- Extends Sprint 008 pattern (function-level guards before sensitive operations)
- No new npm dependencies

---

## Open Questions

None. All design decisions resolved during audit, intent, and interview phases.

---

## Devil's Advocate and Security Critiques Addressed

| Critique | Source | Action |
|---|---|---|
| Save-path rejection tests are P1 (optional) | DA | **Accepted** — moved to P0 as task 5; persistence boundary is central, not optional |
| Legacy stored avatar values may fail new validator | DA | **Addressed** — existing handlers only ever produced `data:image/png;base64,...` or `''`; integration test seed data uses `''`; DoD now includes explicit item confirming seed data is valid |
| `null` return ambiguity (cancellation vs decode failure) | DA | **Acknowledged, not changed** — renderer behavior is identical for all null cases (show current avatar / no-op); adding error types would be scope creep for no UX benefit |
| Persistence contract silently expands to any image subtype | DA | **Acknowledged, intentional** — `IMAGE_DATA_URI_RE` accepts any `data:image/` for forward compatibility; handlers still only emit PNG; the contract expansion is deliberate and documented in the Architecture section |
| "Only two gaps remain" is an unsupported claim | DA | **Clarified** — the audit was scoped to the four checks specified in the seed; "only two gaps remain" refers specifically to those four checks, not a claim of comprehensive coverage |
| `isEmpty()` reliability is platform-dependent | DA | **Acknowledged** — noted in Security Considerations; this is a best-effort content check, not a MIME guarantee; Electron decoder CVEs are a platform concern beyond application scope |
| User-visible behavior for rejection cases not defined | DA | **Rejected** — returning `null` for both cancellation and decode failure is the established contract; renderer shows existing avatar or nothing; no new failure UX is needed for this sprint |
| SVG should be explicitly blocked | DA | **Rejected** — interview confirmed allowing all `data:image/` types; SVG script execution is blocked by Electron `<img>` semantics; documented in Deferred |
| conductor_avatar not in encryption manifest | Security Review | **Noted, out of scope** — pre-existing gap; `conductorAvatar` is not in the manifest (manifest covers `conductor_name`, `pronouns`, `conductor_context`); tracked for a future sprint |
