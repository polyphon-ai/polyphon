# Sprint 001: Docs Overhaul — Full Rewrite with Accurate Screenshots and Videos

## Overview

The Polyphon application has evolved significantly since the docs were first written. Several
features are either undocumented (conductor profile avatar upload, voice avatar icons) or actively
incorrect (continuation policy is documented as a per-voice Voice Panel setting when it is now a
composition-level Composition Builder setting with three modes). The full visual asset library —
~40 screenshots and 3 demo videos — was captured against an older build.

This sprint performs a complete rewrite of all 11 documentation pages in `site/content/docs/`.
Every page is updated for accuracy and consistency with the current app. Screenshot and video
references are updated to precise placeholder descriptions where assets need to be recaptured.
A media audit classifies every existing asset as keep, replace, or new. Capture scripts and
narration guides are written so the visual assets can be reproduced systematically.

**Deliverable:** docs that are correct and complete at the text layer, with clearly described
media placeholders and reproducible capture instructions. Actual screenshot and video capture is
a follow-on task (manual capture, macOS/Windows/Linux install flows, live video).

---

## Use Cases

1. **New user onboarding** — Getting Started and Concepts are the first contact. Must cover the welcome dialog (avatar upload, name, pronouns, skip), first provider setup, and first session.
2. **Building a composition** — Compositions page must accurately reflect the Composition Builder including the new composition-level continuation policy (None / Prompt me / Auto).
3. **Running a session** — Sessions page must cover broadcast and conductor mode, @-mention voice targeting, and the continuation nudge (the "Prompt me" banner between rounds).
4. **Configuring providers** — Providers and Custom Providers pages must match the current Settings UI including provider card states and the auth-less custom provider badge.
5. **Setting up a conductor profile** — Conductor Profile page must document avatar photo upload and crop, in addition to the existing fields.
6. **Systematic media refresh** — Screenshot and video scripts let a human reproducibly capture all assets in a single session without reverse-engineering the app.

---

## Workstreams

### Workstream A: Copy rewrite

Rewrite all 11 doc pages against current renderer source + e2e specs as the authoritative
reference. Domain vocabulary from CLAUDE.md must be used consistently throughout.

### Workstream B: Media audit + placeholder pass

For every screenshot and video reference across all pages, classify:

- **`verified-current`** — asset still accurately represents current UI; keep it
- **`replace-required`** — asset exists but is outdated; insert placeholder
- **`new-required`** — no asset exists yet; insert placeholder

High-priority new captures identified:
- First-run onboarding with avatar upload step
- Avatar crop modal (AvatarEditor)
- Composition Builder showing continuation policy cards (broadcast mode)
- Auto continuation with max-rounds slider
- Session view showing voice avatar icons in the message feed
- Continuation nudge banner (Prompt me mode, between rounds)
- Custom provider with auth-less badge
- About page with version, channel badge, waveform animation

### Workstream C: Capture scripts

Create `docs/screenshot-script.md` and `docs/video-scripts.md` with reproducible instructions
so a future maintainer can refresh the full media set without reverse-engineering the app.

---

## Implementation Plan

### P0: Must Ship

**Rewrite these pages (all have known gaps or need full accuracy pass):**

- [ ] `site/content/docs/getting-started.md` — Update for Node 24, current download table, onboarding avatar upload, skip flow
- [ ] `site/content/docs/concepts.md` — Fix continuation description (composition-level); add voice avatar icons; add continuation nudge concept
- [ ] `site/content/docs/compositions.md` — Add continuation policy section (None / Prompt me / Auto + max rounds slider); verify all other sections
- [ ] `site/content/docs/sessions.md` — Fix continuation section (remove per-voice language); add continuation nudge behavior; add voice avatar icons in feed
- [ ] `site/content/docs/conductor-profile.md` — Add avatar photo upload and crop section (completely missing)
- [ ] `site/content/docs/providers.md` — Verify accuracy; update model list examples; confirm domain links use polyphon.ai
- [ ] `site/content/docs/settings.md` — Verify tab structure; add About page subsection (version, channel badge, build expiry for beta/dev builds)
- [ ] `site/content/docs/custom-providers.md` — Verify auth-less badge language; confirm domain links
- [ ] `site/content/docs/tones.md` — Verify; note that built-in tones can be edited and deleted
- [ ] `site/content/docs/system-prompt-templates.md` — Verify; note snapshot-at-creation behavior
- [ ] `site/content/docs/_index.md` — Update summaries to match rewritten pages

**Docs-wide tasks:**

- [ ] Audit all external links — verify they use `polyphon.ai` (not `polyphon.dev`), and that provider console URLs are current
- [ ] Run media audit: classify every screenshot and video reference as `verified-current`, `replace-required`, or `new-required`
- [ ] Replace stale media references with precise placeholder descriptions (see format below)
- [ ] Create `docs/screenshot-script.md` — step-by-step sequential guide to capture all screenshots, including prerequisite app state and seed data
- [ ] Create `docs/video-scripts.md` — narration scripts + shot lists for all 6 demo videos (3 existing to refresh, 3 new)

**New videos to script (interview-confirmed):**
- Continuation policy nudge — show "Prompt me" banner appearing between rounds, user clicking Continue
- Avatar upload — pick photo → crop in AvatarEditor → avatar appears in sidebar
- Custom provider setup — add Ollama end-to-end, fetch models, launch session

**Existing videos to refresh:**
- `sessions-streaming.mp4` — message streaming (verify still accurate)
- `sessions-at-mention.mp4` — @-mention targeting (verify still accurate)
- `compositions-type-toggle.mp4` — voice type toggle (verify still accurate)

### P1: Ship If Capacity Allows

- [ ] Add cross-links between pages (e.g., Compositions → Sessions → Continuation Policy, Tones → Conductor Profile)
- [ ] Add a "Data backup" note to settings.md about the SQLite DB file paths

### Deferred

- **Import/export of compositions** — not yet implemented; do not stub
- **Keyboard shortcut reference** — useful but out of scope
- **Automated screenshot Playwright pipeline** — separate engineering sprint

---

## Placeholder Format

Use this format for screenshot placeholders:

```markdown
> **Screenshot placeholder:** *[Page/context] — [UI state required] — [Key elements that must be visible]*
> <!-- Prerequisites: [app state, seed data, provider config needed] | Platform: [macOS/Windows/Linux/any] | Theme: [light/dark/any] | Window: [size or "default"] -->
```

Use this format for video placeholders:

```markdown
> **Video placeholder:** *[Flow name] — [Brief description of what the video shows]*
> See `docs/video-scripts.md` → [Section name] for narration script and shot list.
```

**What counts as `verified-current`:** An asset is `verified-current` only if a reviewer has
opened the app, navigated to that exact UI state, and confirmed the asset matches current labels,
layout, and behavior. Screenshots cannot be marked `verified-current` based on a visual guess
from memory — the bar is running the app and checking.

---

## Files Summary

| File | Action | Purpose |
|------|--------|---------|
| `site/content/docs/_index.md` | Update | Section summaries |
| `site/content/docs/getting-started.md` | Rewrite | Node 24, onboarding avatar, skip flow |
| `site/content/docs/concepts.md` | Rewrite | Continuation, avatar icons |
| `site/content/docs/compositions.md` | Rewrite | Continuation policy section |
| `site/content/docs/sessions.md` | Rewrite | Continuation nudge; fix per-voice error |
| `site/content/docs/conductor-profile.md` | Rewrite | Avatar upload (new section) |
| `site/content/docs/providers.md` | Update | Model names, domain links |
| `site/content/docs/settings.md` | Update | About subsection added |
| `site/content/docs/custom-providers.md` | Update | Auth-less badge, domain links |
| `site/content/docs/tones.md` | Update | Built-in tone editability |
| `site/content/docs/system-prompt-templates.md` | Update | Verify accuracy |
| `docs/screenshot-script.md` | Create | Sequential screenshot capture guide |
| `docs/video-scripts.md` | Create | Narration scripts + shot lists for 6 videos |

---

## Definition of Done

- [ ] All 11 docs pages reviewed against current renderer source and are accurate
- [ ] Continuation policy documented as a composition-level feature with None / Prompt me / Auto modes
- [ ] Continuation nudge (Prompt me banner) behavior documented in Sessions page
- [ ] Conductor profile avatar upload and crop documented
- [ ] Voice avatar icons mentioned where relevant (Concepts, Sessions)
- [ ] About page covered as a subsection in settings.md
- [ ] All external links use `polyphon.ai` (not `polyphon.dev`)
- [ ] Media audit complete: every asset classified as `verified-current`, `replace-required`, or `new-required`
- [ ] Every stale/new media reference replaced with a precise placeholder following the placeholder format
- [ ] `docs/screenshot-script.md` exists with step-by-step capture instructions
- [ ] `docs/video-scripts.md` exists with narration scripts for all 6 demo videos
- [ ] Hugo site builds cleanly: `cd site && hugo --minify` produces no errors
- [ ] Domain vocabulary check: no "agent", "bot", "roster" — all uses of domain terms are correct
- [ ] e2e specs cross-referenced for user flow verification (onboarding.spec.ts, compositions.spec.ts, settings-conductor.spec.ts)
- [ ] Every documented flow has been opened in a running app (`make dev`) and confirmed correct — source review alone is not sufficient
- [ ] `verified-current` media assets have been confirmed by running the app, not by visual memory
- [ ] Continuation policy is documented on a canonical page (Compositions) and cross-linked from Concepts and Sessions — no duplication of definition
- [ ] Screenshot placeholders include prerequisites, platform, theme, and window size notes

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| UI labels changed in ways not visible from source review | Medium | Medium | Treat renderer source + e2e specs as authoritative; run app locally if uncertain |
| Existing screenshots appear usable but encode outdated behavior | Medium | Medium | Explicit media audit pass — prefer `replace-required` over implicit trust |
| Scope creep: start redesigning docs structure instead of updating content | Low | Medium | Stick to content accuracy; no structural changes this sprint |
| New features land during the sprint and create churn | Low | Low | Write against current source; note any in-flight work in a "Pending" section if needed |
| Docs ship "confident but wrong" — polished copy that was never verified at runtime | Medium | High | DoD requires running the app for every documented flow; `verified-current` requires runtime confirmation, not visual memory |

---

## Security Considerations

- Screenshot/video scripts must not instruct users to enter real API keys on screen — use placeholder keys or blurred captures
- External links verified against current provider URLs (no stale/redirected domains)
- No user data, keys, or credentials appear in doc prose

---

## Observability & Rollback

- **Verification:** `cd site && hugo --minify` catches broken image/video references; run `hugo serve` to browse all pages locally
- **Rollback:** all changes are in `site/content/docs/` and `docs/`; revert with `git revert <commit>` if needed
- **Post-ship:** navigate all 11 pages in a local Hugo dev server; spot-check each placeholder is actionable

---

## Devil's Advocate Critiques Addressed

| Critique | Decision |
|---|---|
| DoD allows "source review" without runtime verification | Accepted — added runtime verification requirement to DoD |
| `verified-current` has no evidence bar | Accepted — added definition requiring app-open confirmation |
| Placeholder format lacks prerequisites/platform/theme | Accepted — placeholder format updated |
| Cross-page continuation docs could drift | Accepted — added canonical-page + cross-link requirement to DoD |
| "Docs-only sprint can still ship polished misinformation" | Accepted — added explicit risk and mitigation row |
| Sprint is actually 3 projects; scope might overrun | Noted — P0/P1 tiering provides a cut-line if needed; copy rewrite is P0, scripts are also P0 but can be minimal viable first-draft |
| Hugo build is not a semantic quality gate | Noted as correct; runtime app verification in DoD addresses this |
| About page scope is small | Noted — kept as subsection in settings.md as decided in interview |

## Security Findings Addressed

No Critical or High findings. All Low findings were already addressed by existing plan items:
- Screenshot scripts must not expose real API keys (in Security Considerations)
- External links use canonical domain URLs (in P0 link audit task)
- Accurate key-handling language preserved in providers.md update

---

## Dependencies

- No code changes required — this is a docs-only sprint
- Node.js 24 is required to run the app locally for screenshot capture (already the project standard)
- `make dev` used for local app verification when needed
