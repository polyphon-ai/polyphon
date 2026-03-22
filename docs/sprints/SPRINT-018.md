# Sprint 018: Docs Screenshot Refresh and New Screenshot Coverage

## Sprint Theme

**Bring the docs site back into visual alignment with the current product by refreshing
every screenshot placeholder, extending screenshot automation for newly shipped UI, and
closing gaps where important session features are undocumented.**

---

## Overview

The Polyphon docs site is heavily screenshot-driven, but the app has moved faster than the
docs capture pipeline. Several significant features have shipped since the last full
screenshot run:

- **Voice filesystem tools** (Sprint 017) — new Tools section in the voice config panel,
  tool call blocks in the message feed, sandbox checkbox in session creation, Sandboxed
  badge in the session header, CLI voice sandbox warning
- **Markdown rendering** (Sprint 016) — voice responses now render formatted markdown with
  syntax-highlighted code blocks instead of plain text
- **Transcript export** — export modal (Markdown, JSON, plaintext) accessible from the
  session header; undocumented and unscreenshotted
- **Session header polish** — layout, header, and message bubble styling updated

Additionally, one pre-existing gap: `builder-voice-tools.webp` is referenced in both
`tools.md` and `compositions.md` but has no MANIFEST entry and the static file does not
exist — it is a live 404.

Three screenshots also exist in `site/static/` but are not referenced anywhere in docs:
`at-mention-dropdown.webp`, `continuation-nudge.webp`, `continuation-round2.webp`.

This sprint refreshes all 31 existing screenshot placeholders to match the current UI,
adds new screenshots for features that shipped but were never illustrated, and adds a
missing docs section for transcript export.

---

## Product Goals Fit

- **Local-first:** docs must accurately explain the local working-directory, sandboxing,
  CLI, and export flows that define the product's trust model.
- **Provider-agnostic:** screenshots show mixed-provider compositions; no single provider
  dominates the visual story.
- **Extensible:** the screenshot pipeline stays manifest-driven and easy to extend when
  new docs pages or UI states appear.
- **No telemetry:** docs reflect the product honestly, including local-only export and
  filesystem-tool behavior.

---

## Current-State Findings

| Finding | Category |
|---|---|
| `builder-voice-tools.webp` — no static file, no MANIFEST entry | Broken (404) |
| `at-mention-dropdown.webp` — static file exists, not in docs, not in MANIFEST | Orphaned |
| `continuation-round2.webp` — static file exists, not in docs, not in MANIFEST | Orphaned |
| `continuation-nudge.webp` — static file exists, captured by script, not in docs | Wiring gap |
| All 31 existing `![alt](...)` doc image tags — stale descriptions; UI has changed | Stale |
| `sessions.md` — no "Exporting a Transcript" section | Missing docs |
| `settings.md` — says "six tabs" but current UI has 8 | Stale text |

---

## Use Cases

1. **New user reads sessions docs** and sees the actual current header, markdown transcript
   styling, sandbox badge, and export affordance — not an older layout.
2. **User configuring tools** sees the real API-voice Tools UI including the difference
   between read-only and write-capable tools, and a real tool-call block in the feed.
3. **User enabling sandboxing** sees the checkbox in the new-session panel, the CLI warning,
   and the resulting Sandboxed badge in the session header — the full flow.
4. **User learning conductor-directed mode** sees the `@` mention picker alongside the
   voice-panel targeting explanation.
5. **User learning continuation** sees both the prompt banner and the round-2 divider in
   the feed — not just text.
6. **User needing an offline copy** discovers transcript export, understands the three
   formats, and knows that exported files are unencrypted.
7. **Maintainer running `make screenshots`** gets a complete docs refresh without manual
   markdown surgery.

---

## Architecture

```
site/content/docs/*.md
  ↓ replace stale image tags with > **Screenshot placeholder:** blockquotes
placeholder blockquotes
  ↓ make screenshots
scripts/take-screenshots.ts
  ├─ MANIFEST entry per screenshot (one entry per doc file, even if same output path)
  ├─ capture code in track functions
  ├─ captureWebP() or captureClippedWebP() → site/static/images/screenshots/<cat>/<name>.webp
  └─ replacePlaceholder() → replaces blockquote with ![alt](/images/...)
  ↓
docs site renders refreshed screenshots with current alt text
```

**MANIFEST mechanics:** The script matches `> **Screenshot placeholder:** <text>` using
`line.includes(placeholder)`. When the same output file is referenced in two different doc
files (e.g. `builder-voice-tools.webp` in both `tools.md` and `compositions.md`), two
separate MANIFEST entries are required — one per file. Both can share the same `output`
path; the script will overwrite the file once and replace the blockquote in each doc.

**captureClippedWebP vs captureWebP:** Use `captureClippedWebP()` for forms and lists
where there is dead space below the last element. Use `captureWebP()` for full-page states
like settings tabs, session views, and modals.

---

## Implementation Plan

### P0: Must Ship

#### 1. Fix broken image: `builder-voice-tools.webp`

The image is referenced in two docs pages but never captured. Currently a 404.

**Tasks:**
- [ ] `site/content/docs/tools.md` line 40: replace `![Voice configuration panel...]` image
  tag + metadata comment with blockquote:
  ```
  > **Screenshot placeholder:** Tools — voice configuration panel in the Composition Builder showing the Tools section; read-only tools (Read File, List Directory, Search Files, Search File Contents, Fetch URL) checked; write-capable tools (Write File, Move / Rename File, Copy File, Delete File, Run Command) unchecked; amber write-capable warning visible below the toggles
  ```
- [ ] `site/content/docs/compositions.md`: add a second blockquote with the same intent
  but different placeholder text (so both resolve to the same output file):
  ```
  > **Screenshot placeholder:** Compositions — voice configuration panel showing the Tools section with some tools enabled; amber warning visible for write-capable tools
  ```
- [ ] `scripts/take-screenshots.ts`: add two MANIFEST entries pointing to
  `images/screenshots/compositions/builder-voice-tools.webp` (one per doc file)
- [ ] Add capture code in Track 3 (composition builder): navigate to Composition Builder →
  Add Voice → select API provider → scroll Tools section into view → enable a few tools →
  capture

#### 2. Replace all existing screenshot image tags with fresh blockquotes

Replace every `![alt](/images/screenshots/...)` image tag in all docs pages with a
`> **Screenshot placeholder:** <text>` blockquote. Update descriptions where the UI has
materially changed.

Key description updates:

| Doc page | Screenshot | Updated description focus |
|---|---|---|
| `sessions.md` | `full-view.webp` | Markdown-rendered voice messages, updated header |
| `sessions.md` | `new-panel.webp` | Working directory field and sandbox checkbox visible |
| `sessions.md` | `conductor-mode-voice-panel.webp` | Updated header/badge styling |
| `concepts.md` | `concepts-active-session.webp` | Message bubbles with markdown rendering |
| `settings.md` | `settings-overview.webp` | Show current tab count (8 tabs) |
| `compositions.md` | `builder-voice-config-full.webp` | Voice config now includes Tools section |

**Tasks:**
- [ ] `site/content/docs/concepts.md` — replace 2 image tags with blockquotes
- [ ] `site/content/docs/compositions.md` — replace 8 image tags with blockquotes
  (note: `builder-voice-tools.webp` handled in Task 1)
- [ ] `site/content/docs/providers.md` — replace 3 image tags with blockquotes
- [ ] `site/content/docs/sessions.md` — replace 5 image tags with blockquotes; update
  descriptions for `new-panel.webp`, `full-view.webp`, `conductor-mode-voice-panel.webp`
- [ ] `site/content/docs/getting-started.md` — replace 1 image tag with blockquote
- [ ] `site/content/docs/settings.md` — replace 3 image tags with blockquotes; fix "six
  tabs" text to correct count (8: Conductor, Tones, System Prompts, Providers, Encryption,
  General, Logs, About)
- [ ] `site/content/docs/conductor-profile.md` — replace 3 image tags with blockquotes
- [ ] `site/content/docs/custom-providers.md` — replace 3 image tags with blockquotes
- [ ] `site/content/docs/tones.md` — replace 4 image tags with blockquotes
- [ ] `site/content/docs/system-prompt-templates.md` — replace 3 image tags with blockquotes
- [ ] `scripts/take-screenshots.ts` — update MANIFEST `alt` fields for changed screenshots
  (full-view, new-panel, conductor-mode, concepts-active-session, settings-overview,
  builder-voice-config-full)

#### 3. New screenshot: sandboxed session creation

The new-session panel now shows a working directory field and sandbox checkbox. Update
`new-panel.webp` to cover this state.

**Tasks:**
- [ ] Update `new-panel.webp` MANIFEST description to mention working directory + sandbox
  checkbox
- [ ] Add capture code: in Track 4 (sessions), before `startSession()` call, programmatically
  set the working directory field (use `evaluate()` to set it without the file picker), then
  take the screenshot showing the sandbox checkbox

#### 4. New screenshot: session header with Sandboxed badge

The session header shows a green Sandboxed badge + working directory path when sandboxing
is active. This is mentioned in text but has no screenshot.

**Tasks:**
- [ ] Add placeholder in `sessions.md` under "Sandboxing API Voices" section:
  ```
  > **Screenshot placeholder:** Sessions — session header showing the green Sandboxed badge, working directory path, and Broadcast mode badge
  ```
- [ ] Add `sessions/session-header-sandboxed.webp` MANIFEST entry
- [ ] Add capture code in Track 4: start a sandboxed session → capture just the session
  header area using `captureClippedWebP()`

#### 5. New screenshot: tool-call block in message feed

Sprint 017's most significant user-visible feature is tool calls appearing as collapsible
blocks in the message feed. This needs at least one screenshot in the docs.

**Tasks:**
- [ ] Add placeholder in `site/content/docs/tools.md` under "How Tool Execution Works":
  ```
  > **Screenshot placeholder:** Tools — session message feed showing a voice message that includes a collapsible tool-call block (e.g. read_file call with its result); tool block is expanded showing the file path and returned content
  ```
- [ ] Add `sessions/tool-call-inline.webp` MANIFEST entry
- [ ] Add capture code in Track 4: send a message that triggers a tool call → wait for idle →
  expand the tool call block if collapsible → capture

#### 6. New docs section and screenshot: transcript export

Transcript export has shipped but has no documentation in `sessions.md`.

**Tasks:**
- [ ] Add new section to `sessions.md` after "Aborting a Response":

  ```markdown
  ## Exporting a Transcript

  To save a copy of the session conversation, click the **Export** button in the session
  header. A dialog opens with three format options:

  - **Markdown** — formatted text with speaker labels, timestamps, and fenced code blocks.
    Suitable for pasting into documents or viewing in any markdown reader.
  - **JSON** — raw message data including metadata. Suitable for programmatic processing.
  - **Plain text** — unformatted transcript without markup. Suitable for pasting into plain
    editors.

  After selecting a format, a save dialog opens and you choose where to save the file on your machine.

  > **Note:** Exported transcript files are not encrypted. The session content is written in
  > plaintext to wherever you save it. Keep exported files in mind when sharing or storing
  > transcripts.

  > **Screenshot placeholder:** Sessions — transcript export modal showing the three format options (Markdown, JSON, Plain text) with the export note about unencrypted files
  ```

- [ ] Add `sessions/export-modal.webp` MANIFEST entry
- [ ] Add capture code in Track 4: after session idle → click Export button → capture modal

#### 7. New screenshot: CLI sandbox warning

Use Case 3 explicitly calls out the amber CLI warning that appears when sandboxing is
enabled in a session that includes CLI voices. It is mentioned in docs text (`sessions.md`)
but has no screenshot.

**Tasks:**
- [ ] Add placeholder in `sessions.md` under "Sandboxing API Voices" section, after the
  sandbox checkbox description:
  ```
  > **Screenshot placeholder:** Sessions — new session panel showing the amber warning that CLI voices are not affected by sandboxing, visible when the sandbox checkbox is checked in a composition that includes CLI voices
  ```
- [ ] Add `sessions/new-panel-sandbox-cli-warning.webp` MANIFEST entry
- [ ] Add capture code in Track 4: configure composition to include both an API voice and
  a CLI voice → open new session panel → set working directory → enable sandbox checkbox →
  capture the amber CLI warning

#### 8. Wire orphaned static images into docs

Three images exist in `site/static/` but are not referenced in docs. Wire them in with
accurate placeholder descriptions and MANIFEST entries.

**`at-mention-dropdown.webp`** (new MANIFEST entry + capture needed; session must be in
conductor-directed mode first):
- [ ] Add placeholder in `sessions.md` after the `@` targeting description:
  ```
  > **Screenshot placeholder:** Sessions — @ mention voice picker dropdown open in the conductor input showing active voice display names as selectable options
  ```
- [ ] Add MANIFEST entry; add capture code in Track 4 after enabling conductor-directed mode

**`continuation-nudge.webp`** (already captured by script; docs wiring only):
- [ ] Add placeholder in `sessions.md` under "Continuation Rounds" near the Prompt me
  description:
  ```
  > **Screenshot placeholder:** Sessions — continuation nudge banner visible in the session feed asking whether to continue to the next round, with Yes and Dismiss buttons
  ```
- [ ] Add MANIFEST entry pointing to existing output path (capture code already exists in
  Track 4 — verify it still matches current banner copy)

**`continuation-round2.webp`** (new capture; requires two rounds to complete):
- [ ] Add placeholder in `sessions.md` under "Continuation Rounds" near the Auto mode
  description:
  ```
  > **Screenshot placeholder:** Sessions — session message feed showing a round divider separating round 1 and round 2 voice responses, with voice bubbles in both rounds
  ```
- [ ] Add MANIFEST entry; add capture code in Track 4 using Auto continuation to advance
  to round 2

#### 9. Add placeholder validation pass to script (P0)

The entire sprint's correctness depends on every placeholder string in docs exactly
matching a MANIFEST entry. Without automated detection, a mismatch is silent — the image
placeholder stays in the docs and the screenshot is never captured. This is safety
equipment, not optional.

**Tasks:**
- [ ] Add a post-run validation block in `take-screenshots.ts` that scans all docs pages
  for remaining `> **Screenshot placeholder:**` blockquotes after the script finishes
- [ ] If any unreplaced placeholders are found, print them and exit with a non-zero exit
  code so `make screenshots` fails visibly
- [ ] Also log any MANIFEST entries that were not matched to a placeholder (forward-only
  drift: script is ahead of docs)

### P1: Ship If Capacity Allows
- [ ] Fix `settings.md` description and MANIFEST alt text for the settings-overview tab
  count (Conductor, Tones, System Prompts, Providers, Encryption, General, Logs, About = 8)
- [ ] Review and update `<!-- Prerequisites: ... | Platform: ... | Theme: ... | Window: ... -->`
  metadata comments adjacent to each placeholder for accuracy with the current UI

### Deferred

- Redesigning the screenshot script to parse `<!-- Prerequisites: -->` metadata
  automatically — complexity not justified
- Adding video-poster placeholders or docs video sections
- Hugo theme or site CSS changes
- Docs prose cleanup unrelated to screenshot drift
- Homepage (`site/content/_index.md`) screenshot refresh — these are marketing shots and
  subject to a separate creative pass

---

## Files Summary

| File | Action | Purpose |
|---|---|---|
| `site/content/docs/concepts.md` | Modify | Replace 2 image tags with blockquotes |
| `site/content/docs/compositions.md` | Modify | Replace 8 image tags + add tools blockquote |
| `site/content/docs/providers.md` | Modify | Replace 3 image tags with blockquotes |
| `site/content/docs/sessions.md` | Modify | Replace 5 image tags; add 6 new placeholders; add Transcript Export section |
| `site/content/docs/tools.md` | Modify | Replace 1 image tag; add tool-call-inline placeholder |
| `site/content/docs/getting-started.md` | Modify | Replace 1 image tag with blockquote |
| `site/content/docs/settings.md` | Modify | Replace 3 image tags; fix tab count text |
| `site/content/docs/conductor-profile.md` | Modify | Replace 3 image tags with blockquotes |
| `site/content/docs/custom-providers.md` | Modify | Replace 3 image tags with blockquotes |
| `site/content/docs/tones.md` | Modify | Replace 4 image tags with blockquotes |
| `site/content/docs/system-prompt-templates.md` | Modify | Replace 3 image tags with blockquotes |
| `scripts/take-screenshots.ts` | Modify | Update 6 MANIFEST alt strings; add 7 new entries + capture code |
| `site/static/images/screenshots/**` | Regenerate | Updated WebP outputs produced by script |

**Net new screenshot files:** 5 (`builder-voice-tools.webp`, `session-header-sandboxed.webp`,
`new-panel-sandbox-cli-warning.webp`, `export-modal.webp`, `tool-call-inline.webp`)
**Wired from static:** 3 (`at-mention-dropdown.webp`, `continuation-nudge.webp`,
`continuation-round2.webp`)
**Refreshed in place:** 31 existing

---

## Definition of Done

**Broken/missing resolved:**
- [ ] `builder-voice-tools.webp` has a MANIFEST entry and is captured by the script
- [ ] No broken image references remain in any docs page after `make screenshots` runs

**Fresh placeholders in place:**
- [ ] All 31 existing `![alt](...)` image tags replaced with `> **Screenshot placeholder:**` blockquotes
- [ ] Placeholder descriptions accurate for current UI (markdown rendering, updated header, tools section)

**New coverage:**
- [ ] Transcript export section added to `sessions.md` with unencrypted-export note
- [ ] Screenshots added for: sandboxed new-session panel, sandboxed session header, tool-call block in feed, transcript export modal
- [ ] `at-mention-dropdown.webp`, `continuation-nudge.webp`, `continuation-round2.webp` wired into `sessions.md`

**Script integrity:**
- [ ] `make screenshots` completes successfully with no errors and no skipped captures
  (any skip is treated as a failure, not a warning)
- [ ] Every new MANIFEST entry has corresponding capture code in a track function
- [ ] Every placeholder string in docs exactly matches (via string includes) a MANIFEST entry
- [ ] Post-run validation pass finds zero unreplaced `> **Screenshot placeholder:**` blockquotes

**Content quality:**
- [ ] `full-view.webp` and `concepts-active-session.webp` visibly show markdown-rendered
  text (formatted headings, code blocks, or emphasis) — not plain text output
- [ ] `tool-call-inline.webp` shows a visible expanded tool-call block in the message feed
- [ ] `session-header-sandboxed.webp` shows the green Sandboxed badge and a working
  directory path
- [ ] `new-panel-sandbox-cli-warning.webp` shows the amber CLI-voice warning text
- [ ] `export-modal.webp` shows the format selector and the unencrypted-export note
- [ ] All capture sequences use synthetic/demo content (no real user paths, no real
  personal names, no real file contents from the developer's machine)

**Committed repo state:**
- [ ] The sprint is committed with blockquote placeholders in place (before script run)
- [ ] `make screenshots` is run after commit, producing the final image files and converting
  placeholders back to image tags
- [ ] The converted docs (image tags restored) are committed as a follow-up commit

**Site integrity:**
- [ ] After running the script, every `![alt](...)` image reference in docs resolves to an
  existing file under `site/static/images/screenshots/`
- [ ] Hugo build (`cd site && hugo`) succeeds with no broken asset references

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Placeholder text and MANIFEST strings drift out of sync | Medium | High | Copy placeholder text directly from MANIFEST during docs edits; verify with string-includes match |
| Tool-call screenshot requires real provider API key in test mode | Medium | Medium | Use `POLYPHON_ANTHROPIC_API_KEY` in the screenshot runner; or mock the tool call result if the script already uses MockVoice |
| Sandbox checkbox capture requires simulating a file picker | Medium | Low | Use `window.evaluate()` to set the working directory field value directly without triggering native file dialog |
| `@` mention picker capture requires conductor-directed mode enabled | Low | Low | Set directed mode before taking the screenshot; script already navigates to conductor-directed state for other shots |
| continuation-round2 requires 2 full AI rounds — slow and potentially flaky | Medium | Low | Use Auto continuation with max=2; wrap in existing `waitForSessionIdle()` |
| Refreshed session screenshots show plain-text (MockVoice) not markdown | Low | Low | Use a real provider for session screenshots, or have MockVoice return markdown-formatted text |

---

## Security Considerations

- Screenshot content must not include real API keys, real user paths, or real personal data.
- Transcript export docs must clearly state that exported files are not encrypted.
- Sandbox docs must continue to distinguish API voice file restrictions from unrestricted
  CLI subprocess behavior — do not imply CLI voices are sandboxed when they are not.
- The screenshot script creates a temp user data directory per run and does not persist
  sensitive data; this is fine to leave as-is.

---

## Observability & Rollback

- **Verify post-script:** after `make screenshots`, run `grep -r 'Screenshot placeholder'
  site/content/docs/` — should return zero results if all placeholders were replaced.
- **Verify no broken images:** `grep -rh '!\[' site/content/docs/ | grep '.webp' | sed "s/.*(\///" | sed "s/).*//" | sort -u` should list all referenced webp paths; each should exist under `site/static/`.
- **Hugo build:** `cd site && hugo` should succeed with no warnings.
- **Rollback:** blockquote placeholders render as styled blockquotes in Hugo, not broken
  images. If the script fails mid-run, docs remain readable. Reverting placeholder changes
  is a straightforward git revert.

---

## Documentation

- [ ] `sessions.md` — new "Exporting a Transcript" section (P0)
- [ ] `settings.md` — fix tab count from "six" to "eight" (P1)
- [ ] Update `<!-- Prerequisites: ... -->` metadata comments for accuracy (P1)

---

## Dependencies

- `make screenshots` requires `make build` first (`.vite/build/main.js` must exist).
- Live session screenshots require an API key or CLI tool available in the shell.
- No code dependencies; this sprint is docs and automation only.
