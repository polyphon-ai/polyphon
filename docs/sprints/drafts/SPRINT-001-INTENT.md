# Sprint 001 Intent: Docs Overhaul — Full Rewrite with Accurate Screenshots and Videos

## Seed

We have made A LOT of changes to the application recently and it is time to probably
completely rewrite the docs section of the website (which is in the site directory),
we will need all new instructions, screenshots, and videos. Please update the docs,
leaving placeholders with descriptions for any screenshots and videos that need to be
created, along with updating the screenshot and video + narration scripts.

## Context

**Orientation Summary:**

- **No prior sprints** — this is SPRINT-001. No ledger, no sprint history, no prior deferred items.
- **Docs are comprehensive in structure but stale in content** — 11 pages exist under `site/content/docs/` covering: getting-started, concepts, compositions, sessions, providers, settings, custom-providers, tones, system-prompt-templates, conductor-profile. All pages need updates, but some require significant rewrites.
- **Several features are undocumented or incorrectly documented:**
  - **Continuation policy** — moved from per-voice setting to a composition-level setting with three modes (None / Prompt me / Auto) in the Composition Builder. Current docs describe it as a per-voice "Continuation rounds" setting in the Voice Panel, which is wrong.
  - **Avatar / photo in Conductor Profile** — new `conductor_avatar` field + `AvatarEditor` component for uploading and cropping a profile photo. Completely missing from docs.
  - **Voice avatar icons** — each voice now has an `avatarIcon` field rendered in the session feed. Not documented.
  - **Onboarding avatar upload** — the first-launch dialog now includes avatar photo upload. Not documented.
  - **About page redesign** — redesigned with wordmark, animated waveform bars, build expiry countdown (for beta/dev builds), and channel badge. Not documented as a user-facing feature.
- **Rich visual asset library exists** — ~40 screenshots (WebP) + 3 demo videos (MP4) already captured under `site/static/`. All are potentially outdated and need to be reviewed and replaced.
- **App domain is polyphon.ai** — recently migrated from polyphon.dev; docs should use the correct domain in any external links.

## Recent Sprint Context

No prior sprints. This is the first.

## Relevant Codebase Areas

| Area | Relevance |
|---|---|
| `site/content/docs/*.md` | 11 docs pages to rewrite |
| `site/static/images/screenshots/` | ~40 WebP screenshots (all need review) |
| `site/static/videos/docs/` | 3 MP4 demo videos (need review / replacement) |
| `site/static/images/video-posters/` | Poster images for video embeds |
| `src/renderer/components/Composition/CompositionBuilder.tsx` | New continuation policy UI |
| `src/renderer/components/Settings/AvatarEditor.tsx` | New avatar editor |
| `src/renderer/components/Settings/SettingsPage.tsx` | Current settings structure |
| `src/renderer/App.tsx` | Onboarding modal with avatar, sidebar nav |
| `src/renderer/components/Session/SessionView.tsx` | Session view with continuation nudge |
| `e2e/` | Playwright specs that capture app flows for screenshot reference |

## Constraints

- Must follow project conventions in CLAUDE.md (domain vocabulary: voice, composition, session, round, conductor, broadcast)
- Docs live in `site/content/docs/` as Hugo Markdown; screenshot/video assets live in `site/static/`
- Do NOT add comments to doc files unless logic is non-obvious
- Placeholders must be descriptive enough for a human to know exactly what to capture
- No cloud deps — docs must not require signing in to any service to be accurate
- Screenshot and video scripts must be platform-agnostic unless explicitly platform-specific

## Success Criteria

- All 11 doc pages accurately reflect the current app behavior
- Every screenshot reference is either an existing accurate image or a clearly described placeholder
- Every video reference is either an existing accurate video or a clearly described placeholder with narration script
- Continuation policy (composition-level, 3 modes) is correctly documented
- Conductor profile avatar upload is documented
- A screenshot-capture script (or guide) exists so future screenshots can be reproduced systematically
- A video-capture script with narration exists for each demo video

## Verification Strategy

- Spec / documentation: Docs should match the running app. Verifiable by running `make dev` and comparing.
- Reference implementation: `src/renderer/` components are authoritative; `e2e/` specs show user flows.
- Edge cases: CLI voice availability UI, custom provider auth-less badge, onboarding skip flow.
- Testing approach: No automated test for doc accuracy; verification is visual + cross-reference with component source.

## Uncertainty Assessment

- **Correctness uncertainty: Medium** — Some UI flows (e.g., continuation nudge interaction, avatar editor crop UI) need source inspection to document accurately; current docs have known-wrong sections.
- **Scope uncertainty: Low** — 11 pages with clear structure; all need updating; no ambiguity about what "the docs" means.
- **Architecture uncertainty: Low** — Hugo site structure is stable; no pipeline changes needed.

## Approaches Considered

| Approach | Pros | Cons | Verdict |
|---|---|---|---|
| **A: Full rewrite — replace all 11 pages with updated text + placeholder tags for all media** | Accurate, consistent; single source of truth; easy to diff; no outdated content left behind | More work upfront; requires good understanding of every UI flow | **Selected** — given the stated goal ("completely rewrite"), this is the correct scope. Placeholders mean screenshots/videos can follow separately without blocking the text update. |
| **B: Incremental patch — edit only known-wrong sections** | Lower risk of accidental regressions in correct sections | Leaves a mixed state; hard to know which sections are verified vs. unreviewed; deferred items compound | Rejected — "A LOT of changes" makes targeted patching error-prone and incomplete. |
| **C: Generate new docs from e2e test output / Playwright traces** | Automated, reproducible | Playwright traces don't produce docs prose; e2e doesn't cover all settings flows; would need large infrastructure | Rejected — over-engineering for the scope of a docs rewrite. |

## Open Questions

1. Should the "About" page be covered in the docs, or is it informational-only (no doc page needed)?
2. Are there any new features in the pipeline (e.g., import/export of compositions) that should be stubbed in this sprint?
3. Should the screenshot/video script be a separate Markdown guide, an executable shell script, or both?
