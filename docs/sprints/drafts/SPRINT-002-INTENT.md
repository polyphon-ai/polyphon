# Sprint 002 Intent: Walkthrough Video — Deep Settings + Richer Compositions/Sessions

## Seed

Let's make sure that the walkthrough video is really good, goes through all of the settings
first and talks about them, and then creates several different types of compositions and
sessions and demonstrates them and talks about the differences between them. Use the existing
framework that we have for the make videos-walkthrough, make narration-walkthrough, and make
voiceover-walkthrough and the way that all of that works to accomplish this.

## Context

The walkthrough pipeline is fully operational:
1. `scripts/take-videos.ts` → `captureWalkthrough()` → records frames, emits `CueEmitter` events → outputs `full-walkthrough.mp4` + `full-walkthrough-cues.json`
2. `scripts/generate-narration.ts` → reads cues JSON, calls Claude Opus to write narration per cue → outputs `full-walkthrough-narration.vtt`
3. `scripts/generate-voiceover.ts` → reads VTT, calls OpenAI TTS → mixes audio with ffmpeg → outputs `full-walkthrough-with-voice.mp4`
4. Makefile targets: `videos-walkthrough`, `narration-walkthrough`, `voiceover-walkthrough`

The narration quality is driven primarily by two levers inside `captureWalkthrough()`:
- **Cue context strings** — the `context` field in each `cues.emit()` call is what Claude reads when writing narration. Richer context → deeper, more educational narration.
- **`wait()` dwell times** — how long a segment occupies screen time determines the word count target Claude uses. Longer dwells → fuller explanations.

## Recent Sprint Context

**SPRINT-001** — Docs Overhaul (shipped): Rewrote all 11 docs pages, created screenshot/video
scripts, completed media audit. Established the video-narration-voiceover pipeline.
No prior sprints exist.

## Relevant Codebase Areas

- `scripts/take-videos.ts` — `captureWalkthrough()` function (lines 912–1297), `NARRATION_WALKTHROUGH` constant (lines 1495–1510)
- `scripts/generate-narration.ts` — narration generation prompt (no changes needed)
- `scripts/generate-voiceover.ts` — TTS pipeline (no changes needed)
- `Makefile` — `videos-walkthrough`, `narration-walkthrough`, `voiceover-walkthrough` targets (no changes needed)

## Constraints

- Must follow project conventions in CLAUDE.md
- Pipeline must still run end-to-end with `make videos-walkthrough && make narration-walkthrough && make voiceover-walkthrough`
- Ollama must be running (existing `assertOllamaRunning()` constraint is already there)
- Must not change generate-narration.ts or generate-voiceover.ts — narration and voiceover pipelines are working well

## Success Criteria

1. Settings section: every tab (Conductor, Tones, System Prompts, General, Providers) gets sufficient dwell time (≥8s) and a cue context that gives Claude enough detail to explain what the setting does and why it matters
2. Compositions: at least 3 distinct types, each with a cue that contrasts the mode against the alternatives, including continuation policy for the broadcast composition
3. Sessions: each session has at least 2 cues during the actual interaction (not just start + end), and the timing issue between session-started and round1-sent is fixed
4. The resulting narration VTT reads as a coherent, educational product tour when played back
5. `NARRATION_WALKTHROUGH` static text updated to match the new script structure

## Verification Strategy

- Run `make videos-walkthrough` — must complete without error
- Run `make narration-walkthrough` — must produce a new VTT; inspect it for quality
- Play the VTT against the video (Hugo dev server or browser) and verify narration explains each section clearly
- Read generated VTT aloud — should sound like a natural product tour, not a list of captions

## Uncertainty Assessment

- Correctness uncertainty: Low — well-understood Playwright automation
- Scope uncertainty: Low — single file (take-videos.ts), scoped to captureWalkthrough()
- Architecture uncertainty: Low — no architecture changes; purely improving content quality

## Approaches Considered

| Approach | Pros | Cons | Verdict |
| --- | --- | --- | --- |
| **A: Edit cue contexts + dwell times in take-videos.ts only** | Minimal blast radius; directly improves narration quality; pipeline unchanged | Still depends on Claude to write good narration from the cues | **Selected** — the narration generator is already high quality; fixing its inputs is the right lever |
| **B: Modify generate-narration.ts prompt to ask for deeper explanations** | Could improve narration without rerecording | Doesn't fix thin settings coverage or timing issues; can't add words where dwell time is too short | Rejected — addressing symptoms not causes |
| **C: Major flow restructure (add entirely new sections, new compositions)** | Potentially much richer video | High scope risk; would significantly extend an already ~7min video; risks making it too long for marketing use | Rejected — existing flow structure is good; improvements should be surgical |

## Open Questions

1. Should the continuation policy be demonstrated during composition creation only, or should the walkthrough also show the continuation nudge banner in action during a session?
2. Should we add an explicit closing cue (tagline/call-to-action) after the final Ollama session?
