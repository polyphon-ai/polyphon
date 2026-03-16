# Formal Critique of `SPRINT-002-CLAUDE-DRAFT.md`

## Overall Assessment

Claude's draft is a strong execution-oriented sprint plan. It identifies the real weakness in the current walkthrough, stays focused on the capture script that actually drives the problem, and gives an implementer enough concrete detail to make progress quickly. The draft is especially good at turning vague quality goals like "richer narration" into concrete edits to cue text, dwell timing, and one missing composition-setting demonstration.

Its main weakness is not misunderstanding the problem, but treating a few assumptions as already validated. In several places, the draft is more certain than the current codebase justifies, and it leaves out a few operational details that matter if the team wants this sprint to be reproducible rather than just directionally correct.

## What Claude Got Right

The `Overview` is well framed. It correctly locates the root cause in `captureWalkthrough()` rather than in the narration or voiceover generators. That is consistent with the current code in [`scripts/take-videos.ts`](/Users/corey/Code/github.com/polyphon-ai/polyphon/scripts/take-videos.ts), where the settings cues are indeed thin and the tab dwell times are currently only five seconds.

The `Architecture` section is also mostly accurate and useful. Breaking the walkthrough into "Settings tour," "Compositions," and three live session types reflects the actual structure of the capture flow. This makes the draft easy to map onto the current implementation and reduces ambiguity about where changes belong.

The strongest part of the draft is `Implementation Plan -> P0: Must Ship`. Claude does three things particularly well there:

- It provides concrete replacement cue strings instead of merely saying "improve the cues." That is a meaningful strength because the current cue text is demonstrably too thin.
- It identifies a real bug in the walkthrough flow under `Fix broadcast session timing overlap`. That overlap is visible in the current script, where `session-broadcast-started` and `broadcast-round1-sent` are emitted back-to-back with no separating dwell.
- It connects the capture changes to `NARRATION_WALKTHROUGH` instead of treating the narration text as a passive artifact. That is the right instinct, because the static narration block in [`scripts/take-videos.ts`](/Users/corey/Code/github.com/polyphon-ai/polyphon/scripts/take-videos.ts) will otherwise drift from the walkthrough structure.

The `Definition of Done` is also stronger than many draft sprint specs. Requiring settings-tab dwell thresholds, non-overlapping narration timing, and clearer contrasts between broadcast, conductor, and local-only modes gives the sprint measurable outcomes instead of style-only goals.

## What Claude Missed

The biggest omission is in `Files Summary`. Listing only `scripts/take-videos.ts` understates the real surface area of the sprint. Even if only one source file is edited, the sprint materially affects generated assets and downstream verification targets: the walkthrough MP4, cue JSON, poster frame, and narration text output. The plan does not need to list generated files as editable inputs, but it should acknowledge them as concrete outputs to inspect.

The `Overview` and `Implementation Plan` both assume that "no changes to `generate-narration.ts`, `generate-voiceover.ts`, or `Makefile` are needed." That may be true, but the plan states it as a settled conclusion before verification. A better version would say that no changes are currently expected, pending validation that the longer cue structure still produces acceptable narration pacing and voiceover timing.

The `Providers: increase dwell after each toggle + better contexts` task in `P0: Must Ship` is directionally correct, but it misses one important execution detail: the current walkthrough already contains a conditional OpenAI refresh path inside a `try` block. If the button is unavailable because the environment is not fully configured, the walkthrough still emits `openai-models-fetched`. The draft improves the cue text, but it does not call out this mismatch between the visible UI and the emitted cue. That is a real reliability gap.

The `Definition of Done` also misses one verification dimension: it does not require validating that the walkthrough remains under the existing 100MB output budget enforced by `assertOutputWithinBudget(outputMp4, 100)`. The `Risks & Mitigations` section mentions the budget, but because the sprint is explicitly about increasing dwell time and adding more capture steps, that budget should be part of the acceptance criteria, not just a side risk.

The `Dependencies` section is a little too trusting about environment readiness. It lists Ollama, API keys, and provider settings, but it does not distinguish between keys needed for capture versus keys needed for narration generation versus keys only needed if specific UI affordances, such as model refresh, are expected to appear. That matters because some of the proposed cues imply a visible, successful model-fetch path.

## What I Would Do Differently

I would keep the same overall scope, but tighten the plan around three explicit execution threads.

First, in `Implementation Plan`, I would separate "cue quality" from "flow changes." Right now those are interleaved. Grouping all cue-text rewrites together would make it easier to review the educational intent of the walkthrough independently from timing and selector changes.

Second, I would make `Observability & Rollback` more concrete. The current wording says to inspect `full-walkthrough-cues.json` and `full-walkthrough-narration.vtt`, which is good, but I would add explicit checks for:

- cue count changed as expected
- no cue timestamps overlap in the broadcast segment
- the closing cue is present at the end rather than crowding the last local-model response
- output size remains within budget

Third, I would revise `Definition of Done` to distinguish required behavior from desired narrative quality. For example, "Every cue context string describes both WHAT is visible AND WHY it matters" is a good editorial standard, but it is subjective. I would pair it with concrete spot checks, such as naming the specific cues that must meet that bar: `settings-conductor-tab`, `anthropic-cli-mode`, `session-broadcast-started`, and `directed-qwen-responded`.

I would also slightly adjust the `P1: Ship If Capacity Allows` section. The "Voice type badge callout during composition" idea is fine, but it is less important than adding one explicit verification task for whether the continuation-policy selector and any related buttons are stable in the current UI. If there is spare capacity, I would spend it on de-risking selectors before adding another narrated detail.

## Over-Engineering and Gaps

This draft is not heavily over-engineered, but there are a few places where it reaches for unnecessary precision without fully covering the more important risk.

In `Implementation Plan -> P0: Must Ship`, some individual dwell-time prescriptions are overly specific this early. Stating "5-6s" or "4_000" is useful as a starting point, but the real concern is narration readability and total video budget. The plan would be stronger if it treated these numbers as target ranges subject to validation instead of fixed truths.

The `Architecture` section is helpful, but it slightly overstates how cleanly the walkthrough breaks into isolated phases. In the actual code, some later verification depends on earlier configuration having succeeded. For example, provider availability affects what compositions can be created, and composition setup affects later session captures. That dependency chain is more important than the pseudo-diagram suggests.

The biggest gap is around conditional UI behavior. Several tasks in `P0: Must Ship` assume stable visibility of provider-specific controls and successful model-refresh behavior. The draft mentions selector risk for continuation policy in `Risks & Mitigations`, but it does not extend the same skepticism to the provider tour, even though those steps also depend on environment state.

There is also a smaller narrative gap between `Use Cases` and `Implementation Plan`. The use case "Someone deciding whether to install" implies a product-level story about why Polyphon is valuable overall. The draft improves explanatory detail inside the walkthrough, but it does not add any explicit transition or framing cue that ties settings, composition modes, and sessions back into that install decision. The closing tagline helps, but a short mid-video bridge would better support the stated audience.

## Conclusion

Claude's draft is a solid and mostly actionable sprint plan. Its best qualities are specificity, good instincts about where the real problem lives, and strong cue-level editorial guidance. The main improvements I would make are to treat environment-dependent behavior more cautiously, acknowledge generated walkthrough artifacts as first-class outputs, and strengthen acceptance criteria around file size, cue timing, and conditional provider UI behavior. With those adjustments, the plan would move from "good implementation brief" to "reliable sprint spec."
