# Claude's Critique of SPRINT-002-CODEX-DRAFT.md

## What Codex Got Right

1. **Workstream organization** — Breaking the work into four named workstreams (Settings tour, Composition expansion, Live continuation, Cue context quality pass) is a cleaner structure than my flat task list and makes the sprint easier to execute in passes.

2. **Distinguishing the output files** — Codex explicitly listed the regenerated artifacts (`full-walkthrough-cues.json`, `full-walkthrough.mp4`, `full-walkthrough-with-voice.mp4`) as output files in the Files Summary. This is more honest than my implicit "run the pipeline" framing.

3. **Noting the risk of continuation nudge flakiness** — The risk that the nudge may not appear without correct session setup (`Prompt me` + a prompt likely to trigger continuation) is a real risk Codex correctly identified.

4. **Transitional cue as P1** — "Add a short transitional cue between Settings and Compositions that explains the shift from configuration to live orchestration" is a good enhancement I missed. It's correctly tiered as P1.

5. **Definition of Done is more specific than mine** — Codex's DoD explicitly enumerates the 4 session types and requires at least 2 substantive in-session cues per session. My DoD was less rigorous here.

## What Codex Missed or Got Wrong

1. **No concrete cue context examples** — Codex says "rewrite cue contexts so they explain WHAT is visible and WHY it matters" but gives no example replacement strings. My draft provides the actual replacement text for every key cue. Without that, the implementer has to make judgment calls that could reproduce thin contexts. This is a significant gap.

2. **No Playwright selector detail for the continuation policy UI** — Codex doesn't reference which selectors to use for clicking "Prompt me" in the composition builder, or for detecting and clicking the "Allow" button. The implementation needs `window.getByRole('button', { name: /prompt me/i })` and `window.getByRole('button', { name: 'Allow' })` from `captureContinuationNudge()` as reference. Without this, the implementer may write selectors that break.

3. **Missing: the specific video size budget constraint** — The walkthrough has `assertOutputWithinBudget(outputMp4, 100)`. Adding more sessions and longer dwell times will push total video time up. Codex notes "trim low-value waits if runtime grows" but doesn't give a specific budget or suggest measuring the current video length first.

4. **Mixed-provider composition naming not specified** — Codex says "name the composition clearly enough that the contrast is obvious" but doesn't suggest an actual name. My draft can leave this unspecified too, but "Cloud-Local Mix" or "Hybrid Panel" would be more actionable.

5. **No mention of fixing the timestamp overlap bug** — The current walkthrough has a documented overlap between `session-broadcast-started` and `broadcast-round1-sent` in the VTT. This is a concrete bug that should be fixed in this sprint. Codex didn't surface it.

6. **P1 items are vague** — "Tighten session naming and prompt wording" and "Rebalance dwell times in lower-value moments" are too vague to be actionable P1 tasks. They should either be promoted to specific P0 sub-tasks or deferred entirely.

## Approaches I Would Defend Against Codex

- **Providing concrete replacement cue strings**: Codex defers this to the implementer; my draft provides the exact strings. The risk of not providing them is the implementer writes contexts that are still thin or inconsistent. I'd keep my concrete strings in the final plan.

- **Fixing the VTT timestamp overlap**: This is a specific, known bug and should be in the plan. Codex's omission was a gap.

## Synthesis for Merge

The merged plan should:
1. **Take Codex's workstream structure** — it's cleaner
2. **Take my concrete cue replacement strings** — they make the plan immediately executable
3. **Take Codex's DoD specificity** — 2+ in-session cues per session, 4 session types explicit
4. **Add the VTT overlap fix from my draft** — concrete bug, easy win
5. **Add Codex's transitional cue P1 item**
6. **Add Playwright selector guidance for continuation from my draft** — prevents implementation mistakes
