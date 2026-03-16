# Claude's Critique of Codex Draft — Sprint 003

## What Codex Got Right

1. **"Awareness first, installation second" theme** — excellent framing that puts the sprint's
   intentional scope boundary front and center. This is worth carrying into the merged draft.

2. **"A later release overrides earlier per-release dismissal" in DoD** — Claude's draft implied
   this behavior but never made it an explicit acceptance criterion. Codex surfaces it clearly.
   This is important: `dismissed_update_version = "0.2.0"` should not block the banner when
   `0.3.0` is released. Needs to be explicit in the final plan.

3. **Workstreams A–D** — good for organizing implementation across layers (discovery / persistence
   / banner / hardening). Makes the sprint easier to execute in sequence.

4. **Manual verification steps are thorough** — "advance the persisted snooze timestamp" and
   "simulate a newer release version than the dismissed one" are excellent QA notes that Claude's
   draft did not include.

5. **Mentions `src/main/db/queries/` pattern** — the existing project has domain-specific query
   files per domain. Codex correctly notes this should have one. Claude's draft missed this.

6. **GitHub API `/releases/latest` correctly scoped** — Open Question 1 notes that this
   endpoint already filters out pre-releases and drafts by default. This is a good callout;
   no extra filtering needed.

---

## What Codex Missed or Got Wrong

### 1. Persistence model left unresolved (Medium gap)

Codex flags a risk ("too-generic persistence model") but never commits to a design. The
existing architecture is clear: `user_profile` is a single-row settings store and all new
per-user preferences go there. A separate `update_notification_preferences` table would be
over-engineered for two fields. The merged draft should commit to:
- `dismissed_update_version TEXT NOT NULL DEFAULT ''` — added to `user_profile`
- `update_remind_after INTEGER NOT NULL DEFAULT 0` — added to `user_profile`

### 2. IPC model is vague — push vs. poll not specified (Medium gap)

Codex says "add IPC channels for fetching current update-banner state" which implies a
renderer-initiated poll. The correct design (from the existing pattern in the codebase) is a
**push model**: main process checks, then sends `win.webContents.send(UPDATE_AVAILABLE, ...)`.
The renderer also has a `onAvailable` listener via preload. This is how the session/voice
streaming events work. The merged draft should specify the push model explicitly.

### 3. No concrete component file named (Low gap)

Codex says "render a minimal global banner in App.tsx" without creating a named component.
Inlining banner JSX into App.tsx (which is already large) is poor separation. A dedicated
`src/renderer/components/Shared/UpdateBanner.tsx` is the right call.

### 4. No concrete version utility named (Low gap)

Codex mentions "unit tests for version parsing/comparison" but doesn't create a named file
(`src/main/utils/version.ts`). This utility needs to exist as a standalone, testable module.

### 5. Open Question 2 should be answered, not deferred (Low gap)

"Single row or small history keyed by release version?" — single row is obviously correct.
There is no debugging value in a history of dismissed versions. Persisting history creates
indefinite data growth for zero benefit.

### 6. Open Question 3 should be answered, not deferred (Low gap)

Banner copy: `"Polyphon v{version} is available"` — this is sufficient. Leaving it as an
open question signals unnecessary uncertainty.

### 7. No `dismissed_update_version` column change handling (Medium gap)

The acceptance criterion "a later newer release overrides earlier per-release dismissal" means
the check logic is: `dismissed_update_version !== latestVersion`. Claude's draft has this.
Codex describes the behavior but doesn't specify the check implementation, which makes the
integration test harder to write.

---

## What Claude's Draft Has That Codex Should Have

- Concrete file names for the migration, version utility, and IPC handler
- Explicit push IPC model with `win.webContents.send` and `onAvailable` preload listener
- Explicit `user_profile` column-based persistence (vs. separate table)
- Pre-release filtering on `prerelease: false` in GitHub API response (Codex's Open Q1 is
  actually already answered: `/releases/latest` returns latest stable by definition)

---

## Critiques to Reject

- **Workstream structure**: worth keeping in the merged draft; good for execution clarity
- **"Awareness first" theme**: keep, it's a good framing
- The manual verification checklist is worth keeping verbatim

---

## Verdict

Codex's draft is well-structured and high-level, but leaves too many implementation decisions
as open questions. It is best used for the framing sections (theme, background, acceptance
criteria, verification checklist) while Claude's draft provides the concrete implementation
plan, file names, and architecture decisions.
