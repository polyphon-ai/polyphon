# Sprint 002: Walkthrough Video — Deeper Settings Tour and Richer Session Storytelling

## Overview

The full walkthrough video pipeline already works end to end, but the walkthrough capture script
is leaving narration quality on the table. Right now the settings tour moves too quickly, the cue
contexts are often caption-like instead of explanatory, the continuation policy is not shown in
action during the main walkthrough, and the session lineup does not yet include a mixed
cloud-and-local composition.

This sprint improves the inputs to the narration pipeline by editing `scripts/take-videos.ts`
only. The goal is to make the generated narration sound like a deliberate product tour rather than
screen-reader captions. We will do that by strengthening the walkthrough's two main narration
levers: richer `context` strings on cue emissions and longer on-screen dwell times in key sections.

**Deliverable:** an updated walkthrough capture script that produces a stronger
`full-walkthrough-cues.json`, a walkthrough narration script stub that matches the new flow, and a
full pipeline run that yields a more educational `full-walkthrough-with-voice.mp4`.

---

## Use Cases

1. **First-time evaluator** — Understand what each Settings tab does and why it matters before any compositions or sessions are created.
2. **Prospective power user** — See the difference between broadcast, conductor, local-only, and mixed cloud/local setups in concrete examples.
3. **User deciding on continuation policy** — Watch the live "Prompt me" continuation nudge appear in a real broadcast session and see the user explicitly allow round 2.
4. **User comparing provider strategies** — See that Polyphon can mix Anthropic API voices and local Ollama voices in one composition and one session.
5. **Narration pipeline maintainer** — Generate better narration without changing the Claude or TTS stages, by feeding them clearer cues and longer visual segments.

---

## Workstreams

### Workstream A: Settings tour rewrite

Expand the Settings portion of `captureWalkthrough()` so each tab gets enough uninterrupted screen
time for narration and each cue explains both the visible UI and its user value.

### Workstream B: Composition lineup expansion

Add a fourth composition/session type to the walkthrough: conductor mode with one Anthropic API
voice and one local Llama voice. This complements the existing broadcast, conductor, and
local-only examples.

### Workstream C: Live continuation demo

Update the broadcast example so continuation policy is configured as `Prompt me`, then show the
continuation nudge banner actually appearing after round 1 and the user clicking `Allow` to start
round 2 inside the main walkthrough.

### Workstream D: Cue context quality pass

Rewrite walkthrough cue strings throughout the flow so they consistently describe:

- what the viewer can currently see
- what just changed
- why that moment matters in the product model

---

## Implementation Plan

### P0: Must Ship

**Settings section improvements**

- [ ] Increase dwell time for each walkthrough Settings tab to at least 8 seconds: Conductor, Tones, System Prompts, General, Providers
- [ ] Rewrite `settings-conductor-tab` cue so it explains the filled conductor profile fields and why voices use that context
- [ ] Rewrite `settings-tones-tab` cue so it explains that tones shape response style across voices and why presets help standardize behavior
- [ ] Rewrite `settings-system-prompts-tab` cue so it explains reusable prompt templates and why they matter when composing ensembles
- [ ] Rewrite `settings-general-tab` cue so it explains which app-level preferences are visible and why they affect the overall experience
- [ ] Rewrite `settings-providers-tab` and provider-specific cues so they explain visible controls and why API mode vs CLI mode changes setup and trust boundaries
- [ ] Keep Providers as a longer detailed walkthrough, but ensure every major provider cue describes both the UI state and the reason a user would care

**Continuation policy in the main walkthrough**

- [ ] Update the broadcast composition flow to explicitly set continuation policy to `Prompt me`
- [ ] Add a cue during composition setup that explains the `Prompt me` policy and why it is a middle ground between single-round and fully automatic continuation
- [ ] Change the broadcast session script so it runs two rounds via the live continuation banner instead of a generic follow-up cut
- [ ] Emit a cue when round 1 completes that explains the visible nudge banner and why it appears
- [ ] Emit a cue when `Allow` is clicked that explains user control over whether the conversation continues
- [ ] Hold long enough on the visible nudge banner for narration to explain it clearly

**Fourth composition/session type**

- [ ] Add a fourth composition after the existing three: conductor mode mixing Anthropic API voice with local Llama voice
- [ ] Name the composition and session clearly enough that the contrast is obvious in narration
- [ ] Add cues during creation that explain this is a mixed-provider setup combining cloud quality with local control
- [ ] Add at least two in-session interaction cues for the mixed session so narration can compare it against the API-only and local-only examples

**Cue context rewrite across the walkthrough**

- [ ] Review every `cues.emit()` call in `captureWalkthrough()` and rewrite thin caption-style strings into richer explanatory context
- [ ] Ensure each context states what is visible and why it matters, not just what action occurred
- [ ] Strengthen session cues so each session example clearly teaches a distinct behavior:
- [ ] Broadcast: all voices answer together, then continue when permitted
- [ ] Conductor: only the targeted voice responds
- [ ] Local-only: same workflow without cloud dependency
- [ ] Mixed-provider conductor: built-in API and local custom provider can collaborate in one session

**Narration text alignment**

- [ ] Update `NARRATION_WALKTHROUGH` to match the new walkthrough structure, including the richer Settings tour, the live continuation moment, and the new mixed-provider session

### P1: Ship If Capacity Allows

- [ ] Add a short transitional cue between Settings and Compositions that explains the shift from configuration to live orchestration
- [ ] Tighten session naming and prompt wording so each example is more obviously distinct in the generated narration
- [ ] Rebalance dwell times in lower-value moments if the walkthrough becomes meaningfully longer than necessary

### Deferred

- **No changes to `scripts/generate-narration.ts`** — prompt quality is not the bottleneck for this sprint
- **No changes to `scripts/generate-voiceover.ts`** — TTS generation remains unchanged
- **No new video tracks or Makefile targets** — this sprint improves the existing walkthrough asset only

---

## Files Summary

| File | Action | Purpose |
|------|--------|---------|
| `scripts/take-videos.ts` | Update | Improve walkthrough cue quality, dwell timing, live continuation demo, mixed-provider composition/session, and walkthrough narration stub |
| `site/static/videos/home/full-walkthrough-cues.json` | Regenerate | Richer cue contexts for narration generation |
| `docs/video-narration/full-walkthrough.txt` | Regenerate | Static narration helper text aligned to the new walkthrough flow |
| `site/static/videos/home/full-walkthrough.mp4` | Regenerate | Updated walkthrough footage with longer settings tour and new session structure |
| `site/static/videos/home/full-walkthrough-with-voice.mp4` | Regenerate | Final narrated walkthrough after pipeline run |

---

## Definition of Done

- [ ] `captureWalkthrough()` still runs successfully via `make videos-walkthrough`
- [ ] Every Settings tab called out in the intent has at least 8 seconds of walkthrough dwell time
- [ ] The walkthrough explicitly shows continuation policy set to `Prompt me` during composition creation
- [ ] The walkthrough shows the continuation nudge banner live in the main broadcast session after round 1
- [ ] The walkthrough shows the user clicking `Allow`, leading into round 2
- [ ] The walkthrough contains four distinct composition/session examples:
- [ ] Broadcast with continuation prompt
- [ ] Conductor with targeted API voices
- [ ] Local-only conductor session
- [ ] Mixed Anthropic API + local Llama conductor session
- [ ] Each session example has at least two substantive in-session cues after the session opens
- [ ] Cue contexts throughout the walkthrough explain both what is visible and why it matters
- [ ] `NARRATION_WALKTHROUGH` matches the actual walkthrough order and examples
- [ ] `make narration-walkthrough` produces a fresh VTT that reads like a coherent product tour
- [ ] `make voiceover-walkthrough` completes successfully against the new narration

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Longer dwell times make the walkthrough drag | Medium | Medium | Spend time only where narration value increases; trim low-signal waits elsewhere if total runtime grows too much |
| Mixed Anthropic + local Llama session is flaky if provider state is inconsistent | Medium | High | Reuse the existing walkthrough setup path that already enables Anthropic and creates local custom providers before composition creation |
| Continuation nudge may not appear reliably without the right session setup | Medium | High | Explicitly set `Prompt me`, choose a prompt likely to trigger continuation, and preserve a visible hold on the banner before clicking |
| Richer cue text becomes redundant with neighboring cues | Low | Medium | Write contexts as scene-level guidance for narration, not as literal action logs |
| Static narration stub drifts from the walkthrough order | Medium | Medium | Update `NARRATION_WALKTHROUGH` in the same edit as the capture flow changes |

---

## Verification

- Run `make videos-walkthrough`
- Inspect the new `full-walkthrough-cues.json` and spot-check that cue contexts are explanatory rather than caption-like
- Run `make narration-walkthrough`
- Read the generated VTT and verify that the Settings section explains purpose, not just labels
- Confirm the VTT clearly narrates the live continuation banner and the new mixed-provider session
- Run `make voiceover-walkthrough`
- Watch the resulting walkthrough and confirm pacing is comfortable, especially the 8-second Settings holds and the continuation nudge moment

---

## Dependencies

- Existing walkthrough pipeline remains the foundation: `take-videos.ts` → `generate-narration.ts` → `generate-voiceover.ts`
- Ollama must be running for the local provider portions of the walkthrough
- Anthropic API configuration must remain available for the mixed-provider composition example
- No renderer or main-process product changes are required; this sprint is a capture-script improvement pass
