# Sprint 001 Merge Notes

## Claude Draft Strengths
- P0/P1 tiering gives clear cut-line if sprint is interrupted
- Specific output file names for capture scripts (`docs/screenshot-script.md`, `docs/video-scripts.md`)
- Enumerated new videos needed (continuation policy nudge, avatar upload, custom provider)
- Checkbox DoD format — easy to verify during execution
- Hugo build verification step (`cd site && hugo --minify`) in DoD
- Practical "build from source" section identified as needing Node.js 24 update

## Claude Draft Weaknesses (from Codex critique)
- Missing polyphon.ai domain audit as explicit task
- Missing voice avatar icons as a feature gap to document
- About page underscoped as P1 — it's already identified as user-facing in the intent
- e2e specs not called out as first-class verification source
- Onboarding skip flow not mentioned
- No explicit media classification pass (keep / replace / new) — assets could be implicitly trusted
- Architecture diagram section adds little value for a docs-only sprint

## Codex Draft Strengths
- Workstream A/B/C decomposition (copy → media audit → capture system) is clean and parallelizable
- Media classification taxonomy: `verified-current` / `replace-required` / `new-required` — excellent
- Feature-specific acceptance criteria are concrete and testable
- About page correctly included in `settings.md` scope (not deferred)
- Execution ordering (audit → copy → media audit → placeholder replacement → capture instructions → final pass) is sound
- Strong emphasis on renderer source + e2e specs as authoritative references

## Codex Draft Weaknesses (from Claude critique)
- No P0/P1 tiering — no cut-line if sprint is interrupted
- Output files for capture scripts not named
- New videos not enumerated (interview resolved: 3 new videos needed)
- About page still listed as open question despite intent being clear
- No rollback plan
- No Hugo build verification step in DoD
- DoD is narrative prose, not a checkbox list

## Valid Critiques Accepted
- ✓ Add polyphon.ai link audit as explicit task (Codex)
- ✓ Add voice avatar icons as feature gap (Codex)
- ✓ Move About page to in-scope within settings.md (both agree)
- ✓ Make e2e specs explicit in verification plan (Codex)
- ✓ Add onboarding skip flow to feature checklist (Codex)
- ✓ Add media audit classification pass as a deliverable (Codex)
- ✓ Adopt workstream A/B/C structure (Codex)
- ✓ Adopt verified-current / replace-required / new-required taxonomy (Codex)
- ✓ Keep checkbox DoD (Claude)
- ✓ Keep P0/P1 tiering (Claude)
- ✓ Keep specific script file names (Claude)
- ✓ Keep new video enumeration (Claude)
- ✓ Keep Hugo build verification (Claude)

## Critiques Rejected (with reasoning)
- Claude architecture diagram: keeping a brief files summary is still useful for orientating executor; trimming verbose sections
- Codex open question on About page: resolved by interview — no separate page, include in settings.md

## Interview Refinements Applied
- No About page doc — include as section in settings.md
- Capture scripts go in docs/ directory
- 3 new videos: continuation policy nudge, avatar upload, custom provider setup end-to-end

## Final Decisions
1. Scope: 11 pages rewritten + About section added to settings.md + scripts in docs/
2. Structure: 3 workstreams (A: copy, B: media audit, C: capture scripts)
3. New videos: continuation policy, avatar upload, custom provider (3 total new; 3 existing to refresh)
4. DoD: checkbox format with Hugo build verification + e2e cross-check
5. Media: explicit audit pass with verified-current / replace-required / new-required labels
6. Sprint sizing: single sprint, well-scoped — no split needed

## Sprint Sizing Gate
- P0 tasks: 11 page rewrites + media audit + 2 capture script files = ~13 discrete work items
- This is appropriate for a single sprint (docs-only, no code changes)
- No split required
