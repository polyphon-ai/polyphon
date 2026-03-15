# Sprint 001: Docs Overhaul

## Sprint Goal

Rewrite the Polyphon docs so they accurately describe the current desktop app, use the project's domain vocabulary consistently, and clearly mark every screenshot and video that must be recreated for the new release.

## Sprint Theme

Accuracy first. This sprint treats the running app and current source as the authority, replaces stale explanations, and leaves the docs site in a state where copy, screenshots, videos, and capture instructions can all be maintained systematically.

## Background

This is the first tracked sprint. There is no prior sprint ledger, no carry-over, and no deferred backlog from an earlier planning cycle.

The docs surface already exists under `site/content/docs/`, but the product has shifted enough that patching isolated sections would leave too much stale content behind. The biggest known documentation gaps are:

- Continuation policy is now configured at the composition level in the Composition Builder, with `None`, `Prompt me`, and `Auto` modes.
- The Conductor Profile now supports avatar upload and cropping.
- First-run onboarding now includes avatar upload.
- Voices now have avatar icons in the session feed.
- The About page has become a real user-facing surface with branding, waveform animation, version/channel badges, and build-expiry information for non-release builds.
- External doc links should use `polyphon.ai`.

## Product Context

Polyphon is a local-first Electron app for orchestrating multi-voice conversations. The docs in this sprint should consistently use the project's vocabulary:

- `voice`
- `composition`
- `session`
- `round`
- `conductor`
- `broadcast`

The implementation sources most relevant to this sprint are:

- `site/content/docs/*.md`
- `src/renderer/App.tsx`
- `src/renderer/components/Composition/CompositionBuilder.tsx`
- `src/renderer/components/Session/SessionView.tsx`
- `src/renderer/components/Settings/SettingsPage.tsx`
- `src/renderer/components/Settings/AvatarEditor.tsx`
- `src/renderer/components/Settings/AboutPage.tsx`
- `e2e/*.spec.ts`

## In Scope

- Rewrite all docs pages under `site/content/docs/` for current product behavior.
- Update docs index copy so page summaries match the rewritten set.
- Replace stale media references with either verified assets or explicit placeholders.
- Add or update screenshot-capture instructions so screenshots can be reproduced.
- Add or update video-capture instructions and narration scripts for the docs videos.
- Cross-check doc language against the current UI, especially onboarding, composition setup, sessions, settings, custom providers, tones, and templates.

## Out of Scope

- Building a new docs framework or changing the Hugo site structure.
- Shipping final screenshots or final videos in the same sprint if copy can land with precise placeholders first.
- Product feature work unrelated to documentation accuracy.
- Large design changes to the marketing site outside docs needs.

## Primary Outcomes

By the end of the sprint we should have:

1. A full rewritten docs set covering the current app behavior.
2. No known-wrong continuation-policy guidance remaining in the docs.
3. Conductor avatar flows documented in both onboarding and settings contexts.
4. An explicit inventory of screenshots and videos to keep, replace, or newly capture.
5. Reproducible capture instructions for future screenshot and video refreshes.

## Deliverables

### 1. Rewritten docs pages

Rewrite these pages for accuracy and consistency:

- `site/content/docs/_index.md`
- `site/content/docs/getting-started.md`
- `site/content/docs/concepts.md`
- `site/content/docs/compositions.md`
- `site/content/docs/sessions.md`
- `site/content/docs/providers.md`
- `site/content/docs/custom-providers.md`
- `site/content/docs/settings.md`
- `site/content/docs/conductor-profile.md`
- `site/content/docs/tones.md`
- `site/content/docs/system-prompt-templates.md`

### 2. Media placeholder pass

For every screenshot and video reference in those docs:

- keep it only if it still matches the current UI
- otherwise replace it with a descriptive placeholder and capture note
- ensure placeholders tell a human exactly what state to capture, from which screen, and why the image matters

### 3. Screenshot capture instructions

Create or update a reproducible screenshot guide or script that covers:

- launch/setup prerequisites
- recommended seed data and provider setup
- window size and theme expectations
- stable sample content for screenshots
- which flows can be sourced from e2e coverage

### 4. Video capture instructions and narration

Create or update a reproducible guide for each docs video, including:

- target flow
- prerequisites
- shot list
- narration script
- poster image requirement

## Workstreams

### Workstream A: Information architecture and copy rewrite

Rewrite each page around current user tasks rather than legacy UI assumptions.

Key updates expected:

- `getting-started`: current install flow, first launch, onboarding, provider prerequisites, local-first framing
- `concepts`: current definitions for voice, composition, session, round, conductor, and broadcast vs conductor-directed behavior
- `compositions`: current builder flow, broadcast vs conductor-directed modes, composition-level continuation policy, voice ordering, per-voice settings
- `sessions`: current session creation, live message flow, @mentions, continuation nudge behavior, voice panel/status model, session management basics
- `providers`: current built-in provider setup and shell-env behavior
- `custom-providers`: current OpenAI-compatible setup, auth-less endpoints, model fetching expectations
- `settings`: current tab structure, provider settings, custom providers, tones, templates, conductor profile, About page
- `conductor-profile`: current name, pronouns, About me, default tone, color, avatar upload/cropping/removal
- `tones`: built-in vs custom tone behavior, current edit/delete expectations
- `system-prompt-templates`: current creation, editing, reuse, and snapshot behavior in sessions

### Workstream B: Visual media audit

Audit existing assets in:

- `site/static/images/screenshots/`
- `site/static/videos/docs/`
- `site/static/images/video-posters/`

Classify each referenced asset as:

- `verified-current`
- `replace-required`
- `new-required`

High-priority captures to plan for:

- first-run onboarding with avatar upload
- avatar crop modal
- composition builder in broadcast mode with continuation policy visible
- auto continuation with max rounds control
- session view with voice avatar icons
- prompt-me continuation nudge
- custom provider flow with auth-less badge or equivalent no-auth state
- updated About page hero and build/channel indicators

### Workstream C: Capture-system documentation

Use the app and e2e coverage to make media refreshes repeatable rather than one-off.

Likely inputs:

- `e2e/onboarding.spec.ts`
- `e2e/compositions.spec.ts`
- `e2e/settings-conductor.spec.ts`
- `e2e/custom-providers.openai-compatible.test.ts`
- `e2e/voices-overrides-and-misc.spec.ts`
- other session/provider specs as needed

The sprint should leave enough capture guidance that a future maintainer can recreate the docs media set without reverse-engineering the app again.

## Page-Level Acceptance Criteria

### Docs-wide

- Every page uses project vocabulary from `CLAUDE.md`.
- No page documents continuation as a per-voice setting.
- External references use `polyphon.ai` where applicable.
- Docs do not imply any required cloud account beyond the provider a user chooses.

### Media-wide

- Every media reference is either verified current or replaced with a descriptive placeholder.
- Every placeholder includes enough detail to recreate the asset intentionally.
- Every docs video has a matching capture outline and narration script.

### Feature-specific

- Continuation policy is documented as a composition-level broadcast setting with `None`, `Prompt me`, and `Auto`.
- `Auto` mode explains the max-rounds control.
- Onboarding docs mention avatar upload, pronouns, color, About me, and skip behavior.
- Conductor Profile docs explain avatar upload, crop, and removal.
- Session docs mention voice avatar icons in the feed/sidebar where relevant.
- Settings docs include the About page as a user-facing settings area.

## Execution Plan

1. Audit all current docs pages and map every stale section to current source-of-truth code.
2. Rewrite text pages first so copy is no longer blocked on final media.
3. Audit all current screenshot and video references in rewritten pages.
4. Replace stale references with verified assets or placeholders.
5. Produce screenshot and video capture instructions with narration.
6. Run a final pass for terminology, broken links, and consistency across pages.

## Verification Plan

Manual verification will be the primary quality gate for this sprint.

Verification sources:

- run the app with `make dev`
- compare docs language against current renderer code
- use `e2e/` specs as flow references
- review current docs asset paths for existence and relevance

Verification checklist:

- each rewritten page matches current UI labels and flows
- continuation behavior matches `CompositionBuilder` and `SessionView`
- conductor profile details match `SettingsPage` and `AvatarEditor`
- onboarding details match `App.tsx`
- About page details match `AboutPage.tsx`
- media placeholders are specific and actionable

## Risks

- Medium risk of subtle doc inaccuracies if UI labels changed recently in parts not covered by tests.
- Medium risk that existing screenshots appear usable at a glance but encode outdated behavior.
- Low risk of scope creep if the sprint starts trying to redesign docs structure instead of updating content.

## Mitigations

- Treat renderer source as authoritative when copy and old docs disagree.
- Prefer placeholders over questionable legacy screenshots.
- Lean on e2e specs for deterministic flows and edge cases.
- Keep the sprint focused on accuracy and reproducibility, not docs-platform improvements.

## Open Questions

These should be resolved during implementation if possible, but they do not block drafting the sprint:

1. Should the About page get its own docs page later, or remain documented within Settings for now?
2. Should the screenshot/video capture system be a Markdown guide, an executable helper, or both?
3. Are there any near-term features expected to land during the docs rewrite that should be excluded to avoid churn?

## Definition of Done

Sprint 001 is done when:

- all 11 docs pages have been rewritten or fully refreshed
- the docs no longer contain known-wrong product guidance
- all screenshot and video references have been validated or replaced with placeholders
- reproducible screenshot and video capture instructions exist
- the docs set reads as one coherent, current explanation of Polyphon rather than a mix of old and new behavior
