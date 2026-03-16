# Sprint 002 Merge Notes

## Claude Draft Strengths
- Concrete replacement cue strings for every key section — immediately actionable
- Identified the VTT timestamp overlap bug (session-started vs round1-sent)
- Specific Playwright selector guidance for continuation policy UI
- Explicit dependency list with environment requirements per step

## Claude Draft Weaknesses (from Codex critique)
- Files Summary lists only `take-videos.ts`, missing generated artifacts as inspection targets
- Overconfident about no changes needed to other pipeline scripts (should be "not expected" not settled)
- Doesn't add 100MB video budget check to DoD
- DoD quality criteria are subjective without specific cue names as spot-checks
- OpenAI model refresh is in a `try` block — cue emits even if refresh failed silently; draft doesn't acknowledge this

## Codex Draft Strengths
- Cleaner workstream organization (A: Settings tour, B: Composition expansion, C: Live continuation, D: Cue context pass)
- Explicit about 4 session types in DoD
- "At least 2 substantive in-session cues per session" is a measurable DoD requirement
- Transitional cue (Settings → Compositions) as a P1 item
- Acknowledges generated artifacts as outputs to inspect

## Codex Draft Weaknesses (from Claude critique)
- No concrete cue replacement strings — too vague for implementation
- No Playwright selector guidance — risks wrong continuation selectors
- Missing VTT overlap bug
- P1 items ("tighten session naming") are vague
- Didn't surface video budget constraint in DoD

## Valid Critiques Accepted
- ✅ Add 100MB budget check to DoD
- ✅ Add generated artifacts (cues.json, VTT, MP4) as verification outputs to DoD and Observability
- ✅ Note OpenAI model refresh as conditional (try/catch) — cue context should acknowledge model refresh may not complete
- ✅ Strengthen DoD with specific cue spot-checks: `settings-conductor-tab`, `anthropic-cli-mode`, `session-broadcast-started`, `directed-qwen-responded`
- ✅ Add transitional cue (Settings → Compositions) as P1
- ✅ Use Codex's workstream structure as the organizing principle

## Critiques Rejected (with reasoning)
- ❌ "Separate cue quality from flow changes in Implementation Plan" — too much reorganization for a plan that's already clear; the concrete cue strings alongside the timing changes is how the implementer will work
- ❌ "Dwell times should be target ranges not fixed values" — ranges are less actionable; we can adjust after capture, the specific values give a clear starting point

## Interview Refinements Applied
- Live continuation nudge banner is P0 (user decision), not P1/Deferred
- 4th session: conductor mixing Anthropic API + local Llama (user decision)

## Final Decisions
- Workstream structure from Codex
- Concrete cue strings from Claude
- DoD strengthened with: 100MB budget check, specific cue names for spot-checks, 2+ in-session cues per session, generated artifact inspection
- VTT overlap bug fix included
- Selector guidance for continuation buttons included
- OpenAI model refresh noted as conditional in cue context
- Transitional cue P1 included
