# Sprint 002: Walkthrough Video — Deep Settings + Richer Compositions/Sessions

## Overview

The walkthrough video pipeline (`take-videos.ts` → `generate-narration.ts` → `generate-voiceover.ts`) works well end-to-end, but the narration output is thin in the settings section and doesn't explain the differences between composition modes or session types clearly enough. The root cause is in `scripts/take-videos.ts`: settings tabs get only 5 seconds of dwell time each with minimal cue context, and there is no continuation policy demonstration.

This sprint makes surgical improvements to `captureWalkthrough()` in `take-videos.ts`:
- Increases settings dwell times so Claude has enough words-per-segment budget to explain what each setting does
- Rewrites cue context strings to be more descriptive and educational
- Adds a continuation policy step to the broadcast composition
- Adds a closing tagline cue after the final session
- Fixes the timestamp overlap between `session-broadcast-started` and `broadcast-round1-sent`
- Updates `NARRATION_WALKTHROUGH` static text to match

No changes to `generate-narration.ts`, `generate-voiceover.ts`, or `Makefile` are needed.

## Use Cases

1. **New visitor watching the walkthrough**: Needs to understand what Polyphon is, what each setting does, how composition modes differ, and what happens in a session — all in one coherent video
2. **Someone deciding whether to install**: The video should answer "what is this app, why would I use it, and how does it work?"
3. **Someone evaluating local-model support**: The Ollama section should clearly contrast local vs cloud and make the value obvious

## Architecture

```
captureWalkthrough() in take-videos.ts
│
├── Step 1: Onboarding (unchanged)
├── Step 2: Settings tour
│   ├── Conductor tab — INCREASE dwell to 9s, richer context
│   ├── Tones tab — INCREASE dwell to 9s, richer context
│   ├── System Prompts tab — INCREASE dwell to 9s, richer context
│   ├── General tab — INCREASE dwell to 9s, richer context
│   └── Providers subtour — INCREASE per-provider dwell, richer cue contexts
├── Step 3: Compositions
│   ├── Broadcast composition — ADD continuation policy step + cue
│   ├── Conductor composition (unchanged)
│   └── Ollama Duo (unchanged)
├── Step 4: Broadcast session (FIX timing overlap)
├── Step 5: Conductor session (unchanged)
└── Step 6: Ollama session + ADD closing cue
```

## Implementation Plan

### P0: Must Ship

**Files:**
- `scripts/take-videos.ts` — All changes are in `captureWalkthrough()` and `NARRATION_WALKTHROUGH`

**Tasks:**

- [ ] **Settings: increase dwell times to 9s per tab** — `settings-conductor-tab`, `settings-tones-tab`, `settings-system-prompts-tab`, `settings-general-tab` each currently get 5s; change all to `wait(window, 9_000)`

- [ ] **Settings: improve cue contexts** — Replace thin context strings with detailed descriptions:
  - `settings-conductor-tab`: "Settings → Conductor tab — conductor name (Corey), pronouns (they/them), background bio, and default tone all visible; voices use this profile to address the user personally"
  - `settings-tones-tab`: "Tones tab — preset tone cards (Professional, Collaborative, Concise, Exploratory, Devil's Advocate) with descriptions; all voices in a composition inherit the selected tone unless overridden"
  - `settings-system-prompts-tab`: "System Prompts tab — reusable instruction templates; attach any template to a voice in the composition builder to give it a persistent role or specialty"
  - `settings-general-tab`: "General tab — light/dark theme toggle and other app-level preferences"

- [ ] **Providers: increase dwell after each toggle + better contexts** — Currently 4s per provider after enabling; increase to 5-6s for Anthropic API, 5-6s for Anthropic CLI; add dwell increase for the Gemini and model-refresh sections; improve cue contexts to explain API key vs CLI distinction clearly:
  - `anthropic-api-enabled`: "Anthropic API enabled — paste an API key to connect; model selector appears below showing available Claude models"
  - `anthropic-cli-mode`: "Anthropic CLI mode also enabled — CLI mode uses the `claude` command-line tool installed locally; no API key required, runs the model your CLI is configured for"
  - `openai-enabled`: "OpenAI enabled in API mode — both API mode (key + model picker) and CLI mode (codex CLI) are available"
  - `openai-models-fetched`: "Model list refreshed from the OpenAI API — latest available models appear in the picker; useful when new models are released"
  - `gemini-enabled`: "Gemini enabled — Gemini is API-only; no CLI variant exists for this provider"
  - `custom-providers-section`: "Custom Providers section — add any OpenAI-compatible endpoint: Ollama, LM Studio, vLLM, or a private proxy; they appear alongside built-in providers in every composition"

- [ ] **Composition 1 (broadcast): add continuation policy step** — After setting mode to Broadcast and before adding voices, show the continuation policy. Click the continuation policy control and select "Prompt me" (or show the dropdown). Add a cue:
  - `composition-continuation-set`: "Continuation policy set to Prompt me — after each round, Polyphon will ask whether to send another round; Auto would continue automatically, None stops after one round"
  - Dwell: `wait(window, 4_000)`

- [ ] **Fix broadcast session timing overlap** — Currently `session-broadcast-started` (t≈313s in a fresh run) and `broadcast-round1-sent` are emitted so close together that their VTT entries overlap. Add `wait(window, 3_000)` between `sendMessage()` call and the `broadcast-round1-sent` cue emit to give the start cue its own window.

- [ ] **Improve session cue contexts** — Replace thin session cue contexts:
  - `session-broadcast-started`: "Research Panel broadcast session started — Anthropic and OpenAI voice panels visible and ready; all voices will respond to every message simultaneously"
  - `broadcast-round1-sent`: "Research question sent — both voices are streaming their answers in parallel; you can watch them write at the same time"
  - `broadcast-round1-complete`: "Round one complete — both parallel responses visible for comparison; each voice brought a different angle"
  - `broadcast-round2-sent`: "Follow-up sent asking voices to engage with each other's answers — they have the full conversation history so they can reference what the other said"
  - `broadcast-round2-complete`: "Round two complete — voices have built on each other's reasoning; this is shared-context multi-agent research"
  - `session-conductor-started`: "Directed Q&A conductor session started — in conductor mode the conductor sends each message to specific voices using at-mention"
  - `directed-anthropic-responded`: "Only Anthropic responded — the other voice stays silent until addressed; useful when you want a specific perspective"
  - `directed-openai-responded`: "OpenAI responded directly to Anthropic's answer — you orchestrated a real dialogue between two models"
  - `session-ollama-started`: "Ollama Duo session started — both voices are local models running on this machine; no API key, no cloud, completely private"
  - `directed-llama-responded`: "Llama 3.2 answered entirely on local hardware — inference happens on your machine"
  - `directed-qwen-responded`: "Qwen 2.5 answered — two local models in one conversation; Polyphon works identically whether voices are cloud APIs or local models"

- [ ] **Add closing cue after final session** — After `directed-qwen-responded`, add:
  ```ts
  await wait(window, 3_000);
  cues.emit('closing', 'Final screen — all three sessions visible in the sidebar; Polyphon tagline');
  ```
  With context: "All three sessions visible in the sidebar — broadcast for research, conductor for directed dialogue, local for privacy. One chat, many minds."

- [ ] **Update NARRATION_WALKTHROUGH static text** — Update the constant at line ~1495 to match the new script structure, explicitly covering continuation policy and the closing tagline.

### P1: Ship If Capacity Allows

- [ ] **System Prompts tab: hover or click a template** — If the app has any seeded templates, click one to show its content before moving on. Adds ~3s dwell and makes the tab more vivid.
- [ ] **Voice type badge callout during composition** — After adding a voice, add a brief dwell that lets the narration mention the voice type badge (API / CLI / Custom) visible on the saved composition card.

### Deferred

- **Show continuation nudge banner in a live session** — Requires setting continuation to "Prompt me" AND running 2 full rounds, then the banner appears. This would require a 4th session demo and add significant video length. Better covered in the dedicated `continuation-nudge.mp4` doc clip.
- **Tone override per-voice in composition builder** — Showing per-voice tone assignment is a good feature but adds 2+ minutes; the docs clip covers this.
- **Adding a recording of the About tab** — The About tab (version, channel badge, expiry) is already documented in settings.md; not critical for the product walkthrough.

---

## Files Summary

| File | Action | Purpose |
|------|--------|---------|
| `scripts/take-videos.ts` | Modify | Increase dwell times, improve cue contexts, add continuation policy step, fix timing, add closing cue, update NARRATION_WALKTHROUGH |

## Definition of Done

- [ ] `make videos-walkthrough` completes without error (Ollama must be running)
- [ ] Every settings tab (Conductor, Tones, System Prompts, General, Providers) has dwell ≥ 8s
- [ ] Every cue context string describes both WHAT is visible AND WHY it matters
- [ ] Continuation policy is shown and a cue explains the three modes (None, Prompt me, Auto)
- [ ] No overlapping VTT timestamps in the generated narration
- [ ] `make narration-walkthrough` produces a VTT that reads as a coherent educational script
- [ ] Narration for settings section goes beyond single-sentence descriptions and explains what each setting enables
- [ ] Narration clearly contrasts broadcast mode vs conductor mode vs local-only
- [ ] Closing cue present; video ends with Polyphon tagline

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Continuation policy Playwright selector is wrong/changed | Low | Medium | Use `getByRole` with text matching same pattern as broadcast mode toggle; test locally |
| Increased dwell times push video over 100MB budget | Low | Medium | `assertOutputWithinBudget(outputMp4, 100)` will catch this; reduce a few wait() calls if needed |
| Timestamp overlap fix has off-by-one on relative timing | Low | Low | Inspect cues.json after capture; fix is just adding a `wait()` call before the cue emit |
| NARRATION_WALKTHROUGH text gets out of sync with new cue structure | Low | Low | Update it in same commit; it's a reference doc only, not used by narration generator |

## Security Considerations

- No API keys, credentials, or user data appear in the video content — the script uses placeholder keys/seeded data
- Ollama models are local — no external API calls during the local-model demo

## Observability & Rollback

- **Verification**: `make videos-walkthrough && make narration-walkthrough` must complete; inspect `full-walkthrough-cues.json` for cue count and timestamps; inspect `full-walkthrough-narration.vtt` for quality
- **Rollback**: All changes are in `scripts/take-videos.ts`; `git revert` restores the previous script instantly; the previous video/cues/VTT files are already committed and still play correctly

## Documentation

- [ ] `NARRATION_WALKTHROUGH` constant updated in same commit (in-file reference doc)
- [ ] No external doc changes needed — this sprint produces the video, not the docs page

## Dependencies

- Ollama running locally with `llama3.2:1b` and `qwen2.5:0.5b` models pulled
- `ANTHROPIC_API_KEY` set (for `make narration-walkthrough`)
- `OPENAI_API_KEY` set (for `make voiceover-walkthrough`)
- Anthropic, OpenAI, Gemini API keys set in app Settings (for the providers tour)
- `make build-e2e` must have been run (auto-triggered by `make videos-walkthrough`)

## Open Questions

1. Should the continuation policy be set to "Prompt me" and then demonstrated live in a session? (Currently deferred as it would add significant length and the dedicated clip already covers it.)
2. Is there an existing seeded system prompt template visible on the System Prompts tab? If so, should the script click it to show its content?
