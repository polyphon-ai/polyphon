# Formal Critique of `SPRINT-001-CLAUDE-DRAFT.md`

## Overall Assessment

Claude's draft is directionally strong. It correctly interprets the sprint as a documentation-first rewrite, identifies the most important known gaps, and treats screenshots and videos as dependent assets that can be specified before they are re-recorded. The draft is usable as a planning artifact, but it is weaker than it should be in a few important areas: it omits some material called out in the sprint intent, mixes implementation certainty with assumptions that still need validation, and adds a few planning details that feel more elaborate than the sprint requires.

## What Claude Got Right

Claude got the core framing right:

- It correctly chose a full rewrite over incremental patching.
- It correctly centered the sprint on the 11 existing docs pages in `site/content/docs/`.
- It correctly identified continuation policy and conductor avatar upload as critical documentation gaps.
- It correctly treated screenshots and videos as follow-on capture work that should be represented by precise placeholders in the text rewrite.
- It included practical deliverables for screenshot and video guidance rather than stopping at prose updates.
- It included a workable definition of done and a verification step using `hugo --minify`.

The draft is also strong in its operational tone. It reads like something a teammate could execute without much interpretation, and it keeps the sprint focused on documentation accuracy rather than turning it into a product or infrastructure effort.

## What Claude Missed

The largest issue is omission of several items that were explicitly present in the sprint intent:

- It does not mention the `polyphon.ai` domain migration, even though the intent explicitly says docs should use the current domain in external links.
- It omits voice avatar icons as a feature gap, despite that being called out in the source intent.
- It treats the About page as optional or low-priority instead of clearly recognizing that the redesign was already identified as a user-facing surface worth documenting.
- It does not mention onboarding skip flow, which was part of the verification context in the intent.
- It does not call out e2e specs as a first-class input for capture planning and flow verification, even though the intent explicitly names them as an authority for user flows.

There are also some weaker omissions around execution quality:

- The draft does not require a full media inventory of what can be kept versus what must be replaced.
- It does not explicitly distinguish verified assets from stale assets. As written, the team could update text and placeholders without producing a clear keep/replace/new audit.
- It does not restate the platform-agnostic requirement for screenshot and video scripts.

## What I Would Do Differently

I would tighten the sprint around three concrete workstreams:

1. Rewrite all 11 docs pages against current source-of-truth code.
2. Audit every referenced image and video and classify each as keep, replace, or new.
3. Produce reproducible capture guidance based on real app flows and `e2e/` coverage.

I would also make the following adjustments:

- Treat the About page as in scope within `settings.md` unless a separate page is intentionally planned later.
- Add an explicit docs-wide acceptance criterion that all external references use `polyphon.ai`.
- Add voice avatar icons and onboarding skip behavior to the feature checklist.
- Require use of renderer source plus `e2e/` specs for verification, not just source inspection and a Hugo build.
- Reframe media work from "placeholder updates" to "media audit plus placeholder replacement," so existing assets are reviewed systematically instead of implicitly trusted or implicitly discarded.

## Over-Engineering and Gaps

The draft is not wildly over-engineered, but it does carry a few unnecessary or slightly risky choices:

- The architecture section is heavier than this sprint needs. For a docs-only sprint, the file inventory is useful, but the pseudo-architecture diagram adds little decision value.
- The statement that no build pipeline changes are needed is probably fine, but it is presented as certainty before the sprint has actually audited the docs build surface.
- Calling out "update model lists if stale" is underspecified and potentially brittle. Provider model catalogs change frequently, so the sprint should prefer documenting UI behavior and provider setup flows unless there is a deliberate plan for how model lists will be maintained.
- Labeling the About page as P1 weakens alignment with the stated intent, which already described it as a redesigned user-facing feature.

The main gap is not over-engineering but under-specification in a few high-value places:

- no explicit asset classification pass
- no explicit `polyphon.ai` link audit
- no explicit use of `e2e/` as a verification source
- no explicit inclusion of voice avatar icons
- no explicit mention of onboarding skip flow

## Conclusion

Claude's draft is a solid first pass and captures the main spirit of the sprint well. Its biggest weakness is not bad judgment so much as incomplete coverage of the original intent. With a stronger media audit requirement, clearer inclusion of About-page and avatar-icon scope, explicit `polyphon.ai` link cleanup, and tighter verification language grounded in both source and `e2e/` flows, the sprint plan would be materially stronger and less likely to leave known gaps behind.
