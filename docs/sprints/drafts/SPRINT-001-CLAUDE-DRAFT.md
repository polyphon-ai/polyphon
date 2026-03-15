# Sprint 001: Docs Overhaul — Full Rewrite with Accurate Screenshots and Videos

## Overview

The Polyphon application has evolved significantly since the docs were originally written.
Several features are either undocumented (avatar upload in the conductor profile, composition-level
continuation policy) or actively incorrect (continuation still described as a per-voice setting
in the Voice Panel). The full visual asset library — ~40 screenshots and 3 demo videos — was
captured against an older build and may no longer reflect the current UI.

This sprint performs a complete rewrite of all 11 documentation pages in `site/content/docs/`.
Every page is updated for accuracy, with screenshot and video references updated to precise
placeholder descriptions so a human can know exactly what to capture. Alongside the prose rewrite,
we produce a screenshot capture guide and video narration scripts so the visual assets can be
recorded systematically in a follow-up session.

The deliverable from this sprint is docs that are **correct and complete** for the text layer,
with clearly described media placeholders. The actual screenshot and video captures are a
follow-on task — they cannot be automated here (macOS DMG install, live video capture).

---

## Use Cases

1. **New user onboarding** — Gets Started page and Concepts page are a new user's first contact
   with the app. Must accurately describe the welcome dialog (including avatar upload), the
   provider setup step, and the first session flow.
2. **Building a composition** — Compositions page must accurately reflect the Composition Builder
   including the new continuation policy section (None / Prompt me / Auto).
3. **Running a session** — Sessions page must cover broadcast and conductor modes, the @-mention
   voice picker, and the continuation nudge (the "Prompt me" banner that appears between rounds).
4. **Configuring providers** — Providers and Custom Providers pages must match the current Settings
   UI including provider card states and the auth-less custom provider badge.
5. **Setting up a conductor profile** — Conductor Profile page must document the new avatar photo
   upload and crop flow, in addition to the existing fields.
6. **Visual asset capture** — A screenshot script and video narration scripts let a human
   systematically re-capture all media in one session.

---

## Architecture

```
site/content/docs/                  ← 11 Hugo Markdown pages (rewritten)
  _index.md
  getting-started.md
  concepts.md
  compositions.md
  sessions.md
  providers.md
  settings.md
  custom-providers.md
  tones.md
  system-prompt-templates.md
  conductor-profile.md

site/static/images/screenshots/     ← ~40 WebP screenshots (placeholders updated)
site/static/images/video-posters/   ← Poster frames for video embeds
site/static/videos/docs/            ← 3 MP4 demo videos (placeholders updated)

docs/                               ← New: capture guides
  screenshot-script.md              ← Step-by-step screenshot capture guide
  video-scripts.md                  ← Video narration scripts + shot list
```

No build pipeline changes are needed. The Hugo site requires no npm install and builds
with `cd site && hugo --minify`.

---

## Implementation Plan

### P0: Must Ship

**Files to rewrite:**
- `site/content/docs/getting-started.md` — Update for Node.js 24, current download table, avatar in onboarding
- `site/content/docs/concepts.md` — Update continuation description to composition-level; add avatar icon concept
- `site/content/docs/compositions.md` — Add continuation policy section (major addition); verify all other sections
- `site/content/docs/sessions.md` — Fix continuation section (was per-voice, now composition-level; add continuation nudge); verify other sections
- `site/content/docs/providers.md` — Verify for accuracy; update model lists if stale
- `site/content/docs/settings.md` — Verify settings tab structure; update for any new tabs or moved sections
- `site/content/docs/custom-providers.md` — Verify; update auth-less badge language if needed
- `site/content/docs/tones.md` — Verify; built-in tone mutability note (can now be edited/deleted per CLAUDE.md)
- `site/content/docs/system-prompt-templates.md` — Verify; no known major changes
- `site/content/docs/conductor-profile.md` — Add avatar photo upload section (new feature, missing entirely)
- `site/content/docs/_index.md` — Verify section index is current

**New files:**
- `docs/screenshot-script.md` — Sequential screenshot capture guide, one section per page, app state setup instructions
- `docs/video-scripts.md` — Narration scripts and shot lists for all 3 demo videos + any new videos needed

**Tasks:**
- [ ] Audit all 11 doc pages against current app source, list all inaccuracies
- [ ] Rewrite `getting-started.md` with current install flow and updated onboarding (avatar step)
- [ ] Rewrite `concepts.md` — fix continuation description, add avatar icon note
- [ ] Rewrite `compositions.md` — add continuation policy section with all 3 modes; update all screenshot placeholders
- [ ] Rewrite `sessions.md` — fix continuation section (remove per-voice language); add continuation nudge behavior; update placeholders
- [ ] Rewrite `conductor-profile.md` — add avatar photo upload section
- [ ] Review and update `providers.md`, `settings.md`, `custom-providers.md`, `tones.md`, `system-prompt-templates.md` for accuracy
- [ ] Update all screenshot placeholder alt text and comments to accurately describe current UI state
- [ ] Write `docs/screenshot-script.md`
- [ ] Write `docs/video-scripts.md`

### P1: Ship If Capacity Allows

- [ ] Add a brief "About / Build Info" section to `settings.md` or a new `about.md` — covers the About page (build expiry countdown, version, channel badge). Low priority since it's informational.
- [ ] Add cross-links between pages (e.g., Compositions → Sessions, Tones → Conductor Profile)
- [ ] Audit `site/content/docs/_index.md` to ensure the section nav order matches the logical learning path

### Deferred

- **Import/export of compositions** — not yet implemented; do not stub
- **Keyboard shortcut reference page** — useful but out of scope for this sprint
- **Automated screenshot tests** — Playwright screenshot capture against mock app is a separate engineering sprint

---

## Files Summary

| File | Action | Purpose |
|------|--------|---------|
| `site/content/docs/getting-started.md` | Rewrite | Onboarding avatar, Node 24, current download table |
| `site/content/docs/concepts.md` | Rewrite | Fix continuation description, add avatar icon |
| `site/content/docs/compositions.md` | Rewrite | Add continuation policy UI; update placeholders |
| `site/content/docs/sessions.md` | Rewrite | Fix continuation section; add nudge behavior |
| `site/content/docs/conductor-profile.md` | Rewrite | Add avatar photo upload |
| `site/content/docs/providers.md` | Update | Verify accuracy; update model names |
| `site/content/docs/settings.md` | Update | Verify tab structure |
| `site/content/docs/custom-providers.md` | Update | Verify auth-less badge language |
| `site/content/docs/tones.md` | Update | Verify built-in tone editability note |
| `site/content/docs/system-prompt-templates.md` | Update | Verify; no known major changes |
| `site/content/docs/_index.md` | Update | Verify section index |
| `docs/screenshot-script.md` | Create | Step-by-step screenshot capture guide |
| `docs/video-scripts.md` | Create | Video narration scripts + shot lists |

---

## Definition of Done

- [ ] All 11 doc pages have been reviewed against the current app source and are accurate
- [ ] Continuation policy is documented as a composition-level feature (not per-voice)
- [ ] Conductor profile avatar upload is documented
- [ ] Every screenshot reference has either an accurate existing asset OR a precise placeholder description
- [ ] Every video reference has either an accurate existing asset OR a placeholder with narration script
- [ ] `docs/screenshot-script.md` exists with step-by-step capture instructions for all screenshots
- [ ] `docs/video-scripts.md` exists with narration scripts for all demo videos
- [ ] Hugo site builds cleanly: `cd site && hugo --minify` (no broken references)
- [ ] No outdated terminology (no "agent", "bot", "roster" — use "voice", "composition", "ensemble")

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Undiscovered UI changes not caught by source review | Medium | Medium | Cross-reference with e2e specs; run app locally if needed |
| Screenshot placeholders too vague to be actionable | Low | Medium | Each placeholder must specify: which page, which state, which UI elements must be visible |
| Hugo build broken by a bad image path in a placeholder | Low | Low | Use HTML comments for unresolved placeholders; keep img references wrapped in Hugo-safe syntax |
| Continuation nudge UI is complex and misunderstood | Low | High | Read SessionView.tsx fully before writing the continuation nudge section |

---

## Security Considerations

- Doc pages may link to external provider consoles (console.anthropic.com, platform.openai.com, etc.) — verify these are current and correct; do not add tracking parameters
- No user data or API keys appear in docs; the "Data Location" section in settings.md is purely informational
- Screenshot capture script should not instruct users to enter real API keys on camera

---

## Observability & Rollback

- Hugo builds are deterministic; `cd site && hugo --minify` will catch broken references
- Rollback: all changes are in `site/content/docs/` and `docs/`; revert with `git revert` if needed
- Post-ship verification: open docs site locally with `cd site && hugo serve`, navigate all pages

---

## Documentation

This sprint IS the documentation sprint — no additional meta-documentation needed beyond the
`screenshot-script.md` and `video-scripts.md` outputs.

---

## Dependencies

- None — no code changes required; this sprint is docs-only
- Node.js 24 is required to run the app locally for screenshot capture (already upgraded in CI)

---

## Open Questions

1. Should the About page get its own doc page? (It has build expiry, channel badge — useful for
   beta testers to understand, but not a workflow doc.)
2. Is there a "Videos" section on the site where narrated walkthroughs should be embedded, or are
   videos only inline in the doc pages?
3. Should screenshot capture be described as a Playwright-automatable future task, or is it
   strictly manual?
