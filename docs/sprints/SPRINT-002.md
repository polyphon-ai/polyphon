# Sprint 002: Walkthrough Video — Deep Settings Tour + Richer Compositions and Sessions

## Overview

The full walkthrough pipeline works end to end, but the narration the pipeline produces is thin
because its inputs are thin. The `captureWalkthrough()` function in `scripts/take-videos.ts`
uses minimal cue context strings that describe actions ("Settings open on Conductor tab") rather
than explaining what the viewer sees and why it matters. Dwell times are already adequate:
`TIMING_SCALE = 3` in the script means `wait(window, 5_000)` = **15 real seconds** of recording
time — enough for ~28 words of narration. The narration is short because the cue contexts are
short, not because the recording moves too fast.

This sprint improves the walkthrough by making surgical changes to `take-videos.ts` only:
richer cue context strings throughout, a live continuation nudge demonstration (set "Prompt me"
policy, let nudge appear, click Allow), a fourth session type (conductor with mixed cloud + local
voices), and a closing tagline cue. **Dwell times are not changed** — the existing timing is
already generous; improving cue quality is the correct lever.

> **TIMING_SCALE note for implementers:** Every `wait(window, ms)` call produces `ms × 3` real
> seconds in the recording. Existing `wait(window, 5_000)` = 15 real seconds; do not increase
> wait values without checking total walkthrough length stays reasonable.

**Deliverable:** an updated `captureWalkthrough()` that produces a more educational
`full-walkthrough-cues.json`, which generates a coherent product-tour narration when run
through `make narration-walkthrough` and `make voiceover-walkthrough`.

---

## Use Cases

1. **First-time evaluator** — Understand what each Settings tab does before seeing any session
2. **Someone deciding to install** — Video answers "what is this, why would I use it, and how does it work?" in sequence
3. **User evaluating continuation policy** — Watch the Prompt me nudge banner fire in a real broadcast session and see the user allow round 2
4. **User comparing provider strategies** — See that Polyphon can mix Anthropic API voices with local Ollama voices in one composition
5. **Narration pipeline maintainer** — Generate better narration without touching the Claude or TTS stages

---

## Workstreams

### Workstream A: Settings tour
Rewrite cue contexts for all Settings tabs so narration can explain what each setting does and
why it matters. Dwell times are not increased — the current `wait(window, 5_000)` = 15 real
seconds per tab is already sufficient for thorough narration.

### Workstream B: Composition lineup expansion
Add a fourth composition/session type: conductor mode mixing one Anthropic API voice with one
local Llama voice. Demonstrates that cloud and local providers are interchangeable in the
composition builder.

### Workstream C: Live continuation demo
Set the broadcast composition to `Prompt me` continuation policy, let round 1 complete, wait
for the nudge banner, and click Allow before round 2. This replaces the current generic
follow-up prompt with a live demonstration of the continuation feature.

### Workstream D: Cue context quality pass
Rewrite every thin cue context throughout the entire walkthrough. Each context should state
what is visible on screen and why it matters to the viewer, not just what action occurred.

---

## Implementation Plan

### P0: Must Ship

**File: `scripts/take-videos.ts` — `captureWalkthrough()` function and `NARRATION_WALKTHROUGH`**

#### Settings: cue contexts (dwell times unchanged)

- [ ] Replace Settings cue context strings (existing `wait(5_000)` = 15 real seconds each — no timing changes needed):
  - `settings-conductor-tab` → `"Settings → Conductor tab — conductor name (Corey), pronouns (they/them), background bio, and default tone all filled in; voices read this profile to address the user personally and in the right tone"`
  - `settings-tones-tab` → `"Tones tab — preset cards for Professional, Collaborative, Concise, Exploratory, and Devil's Advocate; selecting a tone shapes how every voice in a composition communicates; custom tones can be added"`
  - `settings-system-prompts-tab` → `"System Prompts tab — reusable instruction templates listed; attach any template to a voice in the composition builder to give it a persistent role, specialty, or set of constraints"`
  - `settings-general-tab` → `"General tab — light/dark theme toggle and other app-level preferences that apply across all sessions"`

- [ ] Improve provider cue contexts (existing dwell times are adequate; do not increase):
  - `anthropic-api-enabled` → `"Anthropic API enabled — paste an API key and the model selector appears; choose from Claude Haiku, Sonnet, or Opus for each voice independently"`
  - `anthropic-cli-mode` → `"Anthropic CLI mode also enabled — CLI mode runs the claude command-line tool locally; no API key needed, and it uses whatever model the CLI is configured for"`
  - `openai-enabled` → `"OpenAI enabled in API mode — API key badge confirms the connection; both API mode (key + model picker) and CLI mode (codex CLI) are available for OpenAI"`
  - `openai-models-fetched` → `"Model list refreshed from the OpenAI API — if a key is configured, the latest available models populate the picker; cloud model selection stays current without manual updates"`
  - `gemini-enabled` → `"Gemini enabled — Gemini is API-only; there is no CLI variant for this provider, which is why only one toggle row appears"`
  - `custom-providers-section` → `"Custom Providers section — add any OpenAI-compatible endpoint: Ollama, LM Studio, vLLM, or a private proxy; they appear alongside built-in providers in every composition"`
  - `llama-form-filled` → `"Llama 3.2 custom provider form filled — name, base URL pointing to local Ollama at http://localhost:11434/v1, model llama3.2:1b; fully offline, fully private"`
  - `llama-provider-saved` → `"Llama 3.2 custom provider card saved — it now appears in every composition builder alongside Anthropic, OpenAI, and Gemini"`
  - `qwen-form-filled` → `"Qwen 2.5 form filled with the same Ollama base URL but a different model ID; two local providers, one running server"`
  - `qwen-provider-saved` → `"Both Ollama providers are listed — cloud APIs and local models are peers in Polyphon; no provider is first-class"`

#### Composition 1 (broadcast): continuation policy + live demo setup

- [ ] After clicking `broadcast` mode, add:
  ```ts
  await window.getByRole('button', { name: /prompt me/i }).click();
  await wait(window, 3_500);
  cues.emit('composition-continuation-set',
    'Continuation policy set to Prompt me — after all voices finish a round, a banner asks whether to continue; Auto would continue without asking, None stops after one round');
  ```
  Selector reference: `window.getByRole('button', { name: /prompt me/i })` — matches the "Prompt me" button in CompositionBuilder (confirmed in `captureContinuationNudge()`)

- [ ] Update `composition-named-broadcast` context → `"Composition named Research Panel — broadcast mode means all voices respond to every message simultaneously"`
- [ ] Update `composition-mode-broadcast` context → `"Mode set to Broadcast — every message goes to every voice; all voices respond in parallel each round"`

#### Composition 4 (mixed cloud+local): new

- [ ] After saving Ollama Duo (composition 3), return to compositions list and create a fourth composition:
  ```ts
  await window.getByRole('button', { name: /compositions/i }).click();
  await wait(window, 2_000);
  await window.getByRole('button', { name: 'New Composition', exact: true }).first().click();
  await wait(window, 2_500);
  cues.emit('composition-builder-opened-4', 'Composition builder opened for fourth composition — mixing a cloud API voice with a local model');
  await window.getByPlaceholder('My Composition').fill('Hybrid Panel');
  await wait(window, 2_500);
  cues.emit('composition-named-hybrid', 'Composition named Hybrid Panel — conductor mode, mixing cloud and local providers in one composition');
  await window.getByRole('button', { name: 'Anthropic' }).first().click();
  await wait(window, 3_000);
  await window.getByRole('button', { name: 'Add Voice' }).click();
  await wait(window, 2_500);
  cues.emit('composition-hybrid-anthropic-added', 'Anthropic API voice added — cloud provider with full model selection');
  await window.getByRole('button', { name: /Llama 3\.2/i }).first().click();
  await wait(window, 3_000);
  await window.getByRole('button', { name: 'Add Voice' }).click();
  await wait(window, 2_500);
  cues.emit('composition-hybrid-llama-added', 'Llama 3.2 local voice added alongside Anthropic — cloud and local voices in one composition');
  await window.getByRole('button', { name: 'Save Composition' }).click();
  await wait(window, 3_000);
  cues.emit('composition-hybrid-saved', 'Hybrid Panel saved — four compositions now listed, showing all major configuration patterns');
  ```

#### Broadcast session: live continuation nudge

- [ ] **Fix VTT timestamp overlap**: add `wait(window, 2_500)` between `sendMessage()` call and the `broadcast-round1-sent` emit:
  ```ts
  await sendMessage(window, 'What are the main tradeoffs between microservices and monolithic architectures?');
  await wait(window, 2_500); // ← NEW: separates session-started from round1-sent in VTT
  cues.emit('broadcast-round1-sent', '...');
  ```

- [ ] After round 1 completes, wait for and demonstrate the continuation nudge:
  ```ts
  await waitForSessionIdle(window, 180_000);
  await wait(window, 3_000);
  cues.emit('broadcast-round1-complete', 'Round 1 complete — Research Panel Prompt me continuation is active; nudge banner should appear');
  try {
    const allowBtn = window.getByRole('button', { name: 'Allow' });
    await allowBtn.waitFor({ state: 'visible', timeout: 8_000 });
    await wait(window, 5_000); // hold on the nudge banner so viewers can read it
    cues.emit('continuation-nudge-visible',
      'Continuation nudge banner visible — voices have more to say; Allow lets round 2 begin, Dismiss ends the conversation here; this is the Prompt me policy in action');
    await allowBtn.click();
    await wait(window, 1_500);
    cues.emit('continuation-allowed', 'Allow clicked — round 2 begins automatically; voices are streaming their follow-up responses');
    await window.getByPlaceholder('Waiting for voices\u2026').waitFor({ state: 'visible', timeout: 30_000 });
    await waitForSessionIdle(window, 180_000);
    await wait(window, 4_000);
    cues.emit('broadcast-round2-complete',
      'Round 2 complete — voices built on each other\'s round 1 responses using the shared conversation history; this is multi-round AI research under conductor control');
  } catch {
    // nudge may not appear if voices don't request continuation
    await wait(window, 2_000);
    cues.emit('broadcast-round2-complete', 'Broadcast session complete — both voices have responded in parallel');
  }
  ```
  Remove the old "Round 2" follow-up message entirely — the continuation path replaces it.

#### Session cue contexts: improve all

- [ ] `session-broadcast-started` → `"Research Panel broadcast session started — Anthropic and OpenAI voice panels visible; all voices will respond to every message simultaneously; continuation policy is Prompt me"`
- [ ] `broadcast-round1-sent` → `"Research question sent — both voices streaming their answers in parallel; watch two independent responses appear simultaneously"`
- [ ] `directed-anthropic-targeted` → `"At-mention picker opened, typing @A to target Anthropic — in conductor mode the at-mention picker lists all voices in the composition"`
- [ ] `directed-anthropic-responded` → `"Only Anthropic responded — the other voice stayed completely silent; conductor mode gives precise control over which perspective speaks next"`
- [ ] `directed-openai-targeted` → `"OpenAI targeted via at-mention to respond to Anthropic's answer — the at-mention picker works the same way every time"`
- [ ] `directed-openai-responded` → `"OpenAI replied directly to what Anthropic said — this is orchestrated dialogue between two models, not two parallel monologues"`
- [ ] `session-ollama-started` → `"Ollama Duo session started — both voices are local models running on this machine; no API key, no internet connection required"`
- [ ] `directed-llama-responded` → `"Llama 3.2 answered entirely on local hardware — inference runs on your machine; same interface, no cloud dependency"`
- [ ] `directed-qwen-responded` → `"Qwen 2.5 answered — two local models, one conversation, completely private; Polyphon is provider-agnostic whether voices are cloud APIs or local models"`

#### Session 4 (Hybrid Panel): new

- [ ] After Ollama Duo session, add a 4th session using the Hybrid Panel composition:
  ```ts
  await window.getByRole('button', { name: /^sessions$/i }).click();
  await wait(window, 2_000);
  await window.getByRole('button', { name: 'New Session', exact: true }).first().click();
  await wait(window, 2_500);
  await window.getByRole('button', { name: /Hybrid Panel/i }).first().waitFor({ state: 'visible', timeout: 10_000 });
  await window.getByRole('button', { name: /Hybrid Panel/i }).first().click();
  await wait(window, 2_000);
  await window.getByPlaceholder('My session').waitFor({ state: 'visible', timeout: 5_000 });
  await window.getByPlaceholder('My session').fill('Hybrid Panel Session');
  await wait(window, 2_000);
  await window.getByRole('button', { name: 'Start Session' }).click();
  await window.getByPlaceholder('Message the ensemble\u2026').waitFor({ state: 'visible', timeout: 45_000 });
  await wait(window, 3_000);
  cues.emit('session-hybrid-started',
    'Hybrid Panel session started — Anthropic API voice and local Llama voice ready in the same conductor session; mixing cloud and local providers works identically to any other composition');

  // Direct Anthropic to answer
  await window.getByPlaceholder('Message the ensemble\u2026').click();
  await wait(window, 1_000);
  await window.getByPlaceholder('Message the ensemble\u2026').type('@');
  await wait(window, 2_000);
  await window.getByPlaceholder('Message the ensemble\u2026').type('A');
  await wait(window, 3_500);
  try {
    await window.locator('[role="option"]').first().waitFor({ state: 'visible', timeout: 2_000 });
    await window.locator('[role="option"]').first().click();
    await wait(window, 1_500);
  } catch { /* dropdown shape may differ */ }
  cues.emit('hybrid-anthropic-targeted', 'Anthropic API voice targeted in the hybrid session — same at-mention picker, same conductor workflow');
  await window.getByPlaceholder('Message the ensemble\u2026').type(' What makes a good API design?');
  await wait(window, 1_500);
  await window.keyboard.press('Enter');
  await window.getByPlaceholder('Waiting for voices\u2026').waitFor({ state: 'visible', timeout: 30_000 });
  await waitForSessionIdle(window, 180_000);
  await wait(window, 4_000);
  cues.emit('hybrid-anthropic-responded', 'Anthropic cloud API responded — this voice is using remote inference');

  // Direct Llama to respond
  await window.getByPlaceholder('Message the ensemble\u2026').click();
  await wait(window, 1_000);
  await window.getByPlaceholder('Message the ensemble\u2026').type('@');
  await wait(window, 2_000);
  await window.getByPlaceholder('Message the ensemble\u2026').type('L');
  await wait(window, 3_500);
  try {
    await window.locator('[role="option"]').first().waitFor({ state: 'visible', timeout: 2_000 });
    await window.locator('[role="option"]').first().click();
    await wait(window, 1_500);
  } catch { /* dropdown shape may differ */ }
  cues.emit('hybrid-llama-targeted', 'Local Llama voice targeted to add its perspective — same session, same at-mention workflow, but running locally');
  await window.getByPlaceholder('Message the ensemble\u2026').type(' What would you add to that?');
  await wait(window, 1_500);
  await window.keyboard.press('Enter');
  await window.getByPlaceholder('Waiting for voices\u2026').waitFor({ state: 'visible', timeout: 30_000 });
  await waitForSessionIdle(window, 120_000);
  await wait(window, 4_000);
  cues.emit('hybrid-llama-responded',
    'Local Llama answered — a cloud API voice and a local model voice just had a directed exchange in one session; this is provider-agnostic by design');
  ```

#### Closing cue

- [ ] Replace or augment the final Ollama cue with a proper closing after the hybrid session:
  ```ts
  await wait(window, 3_000);
  cues.emit('closing',
    'All four sessions visible in the sidebar — broadcast for parallel research, conductor for directed dialogue, local-only for privacy, hybrid for mixing cloud and local; one chat, many minds');
  ```

#### NARRATION_WALKTHROUGH update

- [ ] Update the `NARRATION_WALKTHROUGH` constant to match the new walkthrough structure, covering continuation policy, the live nudge demo, the 4th hybrid composition/session, and the closing summary.

### P1: Ship If Capacity Allows

- [ ] **Transitional cue**: add a cue after all Settings tabs are done and before navigating to Compositions:
  ```ts
  await wait(window, 2_000);
  cues.emit('settings-complete', 'Settings fully configured — providers, custom models, and conductor profile ready; time to build compositions');
  ```
  Context: `"Settings tour complete — providers enabled, custom Ollama models added, conductor profile filled; the next section shows how to organize these voices into compositions"`

- [ ] **System Prompts tab: click a seeded template** — if a default system prompt template is visible, click it to show its content before moving on. Adds ~3s dwell, makes the tab tangible.

### Deferred

- **Per-voice tone override in composition builder** — covered better in dedicated docs clips
- **About tab in Settings** — not part of the core product tour narrative
- **Showing `Auto` continuation policy** — `Prompt me` live demo is sufficient; `Auto` is explained in the `composition-continuation-set` cue

---

## Files Summary

| File | Action | Purpose |
|------|--------|---------|
| `scripts/take-videos.ts` | Modify | All capture changes: dwell times, cue contexts, continuation demo, 4th composition/session, closing cue, NARRATION_WALKTHROUGH |

**Generated outputs to inspect after capture:**
| Output | What to check |
|--------|---------------|
| `site/static/videos/home/full-walkthrough-cues.json` | Cue count increased; no overlapping timestamps in broadcast segment |
| `site/static/videos/home/full-walkthrough.mp4` | Size under 100MB; video runtime reasonable |
| `site/static/videos/home/full-walkthrough-narration.vtt` | Settings narration is explanatory not caption-like; continuation nudge narrated |
| `site/static/videos/home/full-walkthrough-with-voice.mp4` | Pacing is comfortable through 8-second Settings holds |
| `docs/video-narration/full-walkthrough.txt` | Matches new walkthrough structure |

---

## Definition of Done

- [ ] `make videos-walkthrough` completes without error (Ollama running, API keys configured)
- [ ] Video output is under 100MB (`assertOutputWithinBudget` passes)
- [ ] Cues JSON gap check passes: minimum gap between any two consecutive cues is >1 real second (run: `python3 -c "import json,sys; c=json.load(open('site/static/videos/home/full-walkthrough-cues.json')); print(min(b['t']-a['t'] for a,b in zip(c,c[1:])))"`)
- [ ] **Human review**: implementer has watched the full `full-walkthrough-with-voice.mp4` and confirms:
  - [ ] Continuation nudge banner is visibly on screen and legible (not just a cue in the JSON)
  - [ ] Hybrid Panel session has both Anthropic and Llama voices visibly responding
  - [ ] Overall pacing is comfortable — no sections feel rushed or excessively slow
- [ ] `settings-conductor-tab` cue context explains what each profile field does for voices
- [ ] `anthropic-cli-mode` cue context explains the API vs CLI distinction
- [ ] Continuation policy selection (`Prompt me`) is shown during broadcast composition creation
- [ ] `continuation-nudge-visible` cue is present in `full-walkthrough-cues.json`
- [ ] `session-broadcast-started` and `broadcast-round1-sent` timestamps do not overlap in generated VTT
- [ ] Hybrid Panel composition (Anthropic API + local Llama) created and saved
- [ ] Hybrid Panel session has ≥2 substantive in-session cues
- [ ] All four session types have ≥2 substantive in-session cues each
- [ ] `make narration-walkthrough` produces VTT with explanatory Settings narration (not just tab labels)
- [ ] `directed-qwen-responded` cue narration explicitly references provider-agnostic design
- [ ] Closing cue present in cues JSON with four-session summary
- [ ] `NARRATION_WALKTHROUGH` constant updated to match new walkthrough structure

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Continuation nudge does not appear in the recording | Medium | High | The human review DoD item catches this — cue in JSON is not sufficient; if nudge never fires, consider using a prompt that reliably produces continuation requests (e.g. open-ended research questions) |
| TIMING_SCALE=3 inflates wait() times: new compositions/sessions add significant wall-clock capture time | Medium | Medium | Do NOT increase wait() values; existing timing is already adequate; if new session adds >5 min to capture, trim some within-session waits |
| Video over 100MB | Low | Medium | `assertOutputWithinBudget` catches this; new local-model sessions (small models) add less than cloud sessions |
| `getByRole('button', { name: /prompt me/i })` selector breaks | Low | Low | Selector confirmed in `captureContinuationNudge()` which already runs; same UI |
| OpenAI model refresh is in a `try` block — `openai-models-fetched` emits even if refresh didn't complete visibly | Medium | Low | Update cue context to say "if a key is configured" to make narration conditional-appropriate |
| Mixed session flaky if Anthropic key not configured | Low | Medium | App will show API key error state; add `try/catch` around hybrid session similar to existing `try/catch` blocks in other sessions |

---

## Security Considerations

- No API keys, credentials, or user data appear in the video — script uses placeholder/seeded data
- All Ollama models are local — no external network calls during the local-model portions
- The walkthrough does not record or transmit real user data

---

## Observability & Rollback

**Verification after `make videos-walkthrough`:**
- `wc -l site/static/videos/home/full-walkthrough-cues.json` — cue count should be higher than previous (was ~35 cues)
- Check no overlapping timestamps: `cat full-walkthrough-cues.json | python3 -c "import json,sys; c=json.load(sys.stdin); pairs=list(zip(c,c[1:])); gaps=[b['t']-a['t'] for a,b in pairs]; print(min(gaps))"` — minimum gap should be >1s
- `ls -lh site/static/videos/home/full-walkthrough.mp4` — size under 100MB

**Verification after `make narration-walkthrough`:**
- Read `full-walkthrough-narration.vtt` — Settings section should read as product education, not captions
- Verify `continuation-nudge-visible` label appears in the VTT
- Verify `closing` label appears at the end

**Rollback:** All changes are in `scripts/take-videos.ts`. `git revert <commit>` restores the previous script. The old video/cues/VTT files are committed and still playable.

---

## Documentation

- [ ] `NARRATION_WALKTHROUGH` constant updated in same commit (in-file reference doc, no separate update needed)

---

## Dependencies

- Ollama running locally with `llama3.2:1b` and `qwen2.5:0.5b` pulled — required for composition + session capture
- Anthropic, OpenAI, Gemini API keys configured in the app's Providers settings (for the settings tour)
  - OpenAI key only needed to show the model refresh affordance; the `try/catch` means capture proceeds without it
- `ANTHROPIC_API_KEY` env var set — required for `make narration-walkthrough`
- `OPENAI_API_KEY` env var set — required for `make voiceover-walkthrough`
- `make build-e2e` must have run — auto-triggered by `make videos-walkthrough`

---

## Open Questions

_All resolved during planning._

1. **Live continuation nudge**: show in session ✅ (user decision: live demo in broadcast session)
2. **4th session type**: conductor mixing Anthropic API + local Llama ✅ (user decision: "Hybrid Panel")
