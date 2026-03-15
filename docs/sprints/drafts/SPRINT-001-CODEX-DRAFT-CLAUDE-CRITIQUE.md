# Claude Critique of SPRINT-001-CODEX-DRAFT.md

## What Codex Got Right

1. **Accurate gap inventory** — Codex identified the same core gaps I did (continuation policy, avatar upload, onboarding avatar, voice avatar icons, About page, domain migration). Both drafts are in agreement on the critical correctness issues.

2. **Workstream structure** — The A/B/C workstream breakdown (copy rewrite, media audit, capture-system docs) is a clean decomposition that makes parallel execution easier. My draft used flat task lists; Codex's structure is more clearly parallelizable.

3. **Media classification framework** — The `verified-current` / `replace-required` / `new-required` taxonomy is excellent and more actionable than my "update all placeholder alt text" instruction. This should be adopted into the final plan.

4. **Explicit About page** — Codex chose to include the About page in scope (as part of `settings.md`), where I explicitly deferred it. Given the interview answer (no separate About doc), Codex's approach of including it as a section in `settings.md` is actually the right call and more complete than my plan.

5. **Feature-specific acceptance criteria** — Codex's page-level acceptance criteria section is more concrete than my DoD. Items like "Continuation policy is documented... with `None`, `Prompt me`, and `Auto`" and "Onboarding docs mention avatar upload, pronouns, color, About me, and skip behavior" are highly specific and testable.

6. **Execution ordering** — The 6-step execution plan (audit → copy → media audit → placeholder replacement → capture instructions → final consistency pass) is sensible and avoids writing placeholders before understanding what changed.

## What Codex Missed or Left Vague

1. **No P0/P1 tiering** — The draft has no priority tiers. If the sprint is interrupted, there's no guidance on what to cut. My draft distinguished must-ship (all 11 pages + scripts) from ship-if-capacity (About section in settings, cross-links). Tiering is essential for sprint execution.

2. **No specific file outputs for capture scripts** — Codex describes what the screenshot and video scripts should *contain* but never names the output files (`docs/screenshot-script.md`, `docs/video-scripts.md`). The executor won't know where to put them. The intent document from the interview resolved this: `docs/` directory.

3. **No new videos specified** — Codex doesn't enumerate which new demo videos are needed. The interview identified 3 new videos (continuation policy nudge, avatar upload, custom provider setup). The Codex draft's media section identifies high-priority screenshot captures but doesn't translate this to video deliverables.

4. **About page scoping is inconsistent** — Codex's open questions still ask "Should the About page get its own docs page?" — but then also lists it in the `settings` workstream. The interview resolved this (no separate page, include in Settings), but Codex left it as an open question.

5. **Missing rollback plan** — Codex has a risks/mitigations section but no explicit rollback plan. Since all changes are in `site/content/docs/` and `docs/`, rollback is trivial (`git revert`), but it should be stated.

6. **No Hugo build verification step** — The DoD doesn't mention running `cd site && hugo --minify` to verify no broken references. This is an easy, zero-cost verification step that should be required.

7. **No cross-reference to e2e as verification** — Codex mentions e2e specs as "likely inputs" for capture guidance but doesn't make cross-referencing them part of the DoD or verification plan for the rewritten copy.

## What Codex Would Do Differently (that I would defend against)

**Codex includes the About page in scope** — I deferred it as P1. The interview answer was "no separate About page doc" but Codex adds it as a subsection of `settings.md`. I would now adopt this: it's a small addition, the feature exists, and it serves beta testers. My initial exclusion was too conservative.

**Codex's Definition of Done is narrative rather than checklist** — I prefer a checkbox DoD because it's easy to verify. Codex's prose DoD reads well but is harder to use during execution. My checklist format should be retained in the merge.

## Summary Judgment

Codex's draft is **stronger on structure** (workstreams, media classification) and **weaker on execution specifics** (file names for outputs, new video list, P0/P1 tiering, DoD checkbox format). The merge should take:
- Codex's workstream decomposition (A/B/C)
- Codex's `verified-current` / `replace-required` / `new-required` media taxonomy
- Codex's feature-specific acceptance criteria
- Codex's inclusion of About page as a subsection of `settings.md`
- My P0/P1 tiering
- My specific output file names (`docs/screenshot-script.md`, `docs/video-scripts.md`)
- My enumerated new videos (continuation policy, avatar upload, custom provider)
- My checkbox DoD format
- My Hugo build verification step
