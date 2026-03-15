# Devil's Advocate Review of `SPRINT-001.md`

## Approval Recommendation

Do not approve this sprint as written. It is organized and readable, but it is still making too
many unproven assumptions for a "finalized" plan. The document reads as if the team already knows
the current product state, asset inventory, verification sources, and capture workflow well enough
to promise a full rewrite of 11 pages plus a full media audit plus six video scripts in one sprint.
That confidence is not earned anywhere in the plan.

The biggest problem is that this plan treats "docs-only" as if that makes the work low-risk. It
does not. A docs sprint built on stale product understanding can ship polished misinformation very
quickly.

## 1. Flawed Assumptions

- The plan assumes renderer source plus e2e specs are a reliable source of truth for user-facing
  behavior. In **Workstream A: Copy rewrite** and the **Definition of Done**, it says pages will be
  "reviewed against current renderer source" and that `e2e` specs will be cross-referenced. That is
  not enough. Source code tells you intent, not necessarily runtime behavior, edge cases, disabled
  states, feature flags, platform differences, or sequencing bugs. e2e tests tell you only what the
  tests happen to assert. If the UI has drifted faster than test coverage, this sprint will
  canonize the wrong behavior.
- The plan assumes the list of "known gaps" is close to complete. The **Overview** and **P0: Must
  Ship** sections name continuation policy, avatar upload, provider settings, About, and avatar
  icons as if those are the main deltas. That is a dangerous framing error. A documentation set old
  enough to have "~40 screenshots and 3 demo videos" captured against an older build is almost
  certainly wrong in more places than the plan already knows about. The sprint is biased toward
  fixing the issues already discovered and missing the unknown ones.
- The plan assumes the current app state is stable enough to document once. In **Risks &
  Mitigations**, "New features land during the sprint" is rated Low/Low. That looks naïve. The
  whole reason this sprint exists is that the docs fell behind product churn. Declaring future churn
  low-risk without evidence is wishful thinking, not planning.
- The plan assumes external dependencies are easy to verify. In **P0: Must Ship**, it requires
  auditing provider console URLs and model list examples, and in **Security Considerations** it
  requires current external links. Provider docs and console URLs change independently of this repo.
  If those links are unstable, the team has accepted a maintenance burden without defining a source
  of truth or an owner.
- The plan assumes "Node.js 24 is required to run the app locally" is a settled fact. In
  **Dependencies**, that requirement is stated as absolute, and **getting-started.md** is explicitly
  scoped to "Node 24" in **P0: Must Ship**. If install docs, CI, packaging, or contributor reality
  are not uniformly on Node 24 yet, the sprint will hard-code a version claim that ages badly or is
  already false in practice.
- The plan assumes one canonical domain migration is sufficient. In **P0: Must Ship** and the
  **Definition of Done**, it only checks for `polyphon.ai` vs `polyphon.dev`. That is too narrow.
  It does not account for screenshots, narration scripts, inline examples, alt text, captions, or
  other embedded strings that might still leak old branding.
- The plan assumes "actual screenshot and video capture is a follow-on task" reduces execution
  risk. The **Overview** says the sprint ships placeholders and scripts instead of assets. In
  reality, that defers the one step that would prove the rewritten docs are actually reproducible.
  The team is planning to certify a capture process it has not executed.

## 2. Scope Risks

- This is not one sprint; it is at least three different projects bundled together. The **Overview**
  promises a complete rewrite of 11 docs pages. **Workstream B** adds a full asset inventory and
  placeholder rewrite. **Workstream C** adds operational runbooks for screenshots and six videos.
  Each of those can consume a sprint on its own if the current docs are materially stale.
- The plan underestimates the hidden labor in "verify accuracy." In **P0: Must Ship**, nine pages
  are marked "verify" or "rewrite" with broad language like "verify all other sections" and "full
  accuracy pass." That is scope without boundaries. A page is never "verified" until someone opens
  the app, exercises the flow, checks unhappy paths, and compares wording to actual UI labels. None
  of that effort is estimated or constrained.
- The media audit likely balloons immediately. **Workstream B** says "for every screenshot and
  video reference across all pages, classify." The **Overview** also mentions "~40 screenshots and
  3 demo videos," while **P0: Must Ship** suddenly expands video work to "all 6 demo videos." That
  mismatch alone is a red flag: the plan is not even stable on how many assets exist versus how many
  are required.
- The capture scripts are pretending setup complexity away. **Workstream C** and the **Files
  Summary** call for "step-by-step sequential" capture instructions with prerequisite app state and
  seed data. Where does that state come from? Is there a seed database? A fixture loader? Manual
  setup? Reset instructions? Cross-platform notes? The plan asks for reproducibility without
  defining the environment model needed to make reproducibility real.
- The providers surface is a hidden dependency swamp. **Use Cases** and **P0: Must Ship** require
  current provider card states, auth-less badges, custom provider setup, model fetching, and current
  console links. That touches third-party integrations, local model tooling, network conditions, and
  UI states that may only appear with valid credentials or specific provider responses. For a
  so-called docs-only sprint, that is a large external-behavior dependency chain.
- The About page scope is deceptively small. **Use Cases** and **P0: Must Ship** treat it as a
  subsection in `settings.md`, but the requested coverage includes version, channel badge, build
  expiry for beta/dev builds, and waveform animation. That is not a quick text addition. It implies
  environment-dependent states that may not all be observable in one build.
- The plan says "no structural changes this sprint" in **Risks & Mitigations**, but **P1: Ship If
  Capacity Allows** adds cross-links, and the overall rewrite may force navigation, ordering, and
  summary changes anyway. Structural churn is not actually out of scope if page summaries,
  placeholders, and cross-page conceptual flow are being rewritten together.

## 3. Design Weaknesses

- The architecture of this sprint is backwards: it optimizes for document production, not truth
  discovery. **Workstream A/B/C** implies the team can rewrite copy, then audit media, then write
  capture scripts as mostly separate streams. That is how you get elegant documentation built on
  unverified assumptions. The operationally safer design would force a verified flow inventory first,
  then page rewrites and media planning from that inventory.
- The placeholder strategy can institutionalize ambiguity. The **Placeholder Format** only requires
  a context, UI state, and visible elements. That sounds precise, but it still permits placeholders
  that are too vague to reproduce consistently across contributors, OSes, window sizes, or feature
  states. There is no required slot for viewport, account state, sample data, platform, theme, or
  preconditions.
- The plan hard-codes docs to implementation details that may be unstable. In **P0: Must Ship**, it
  wants model list examples, exact continuation mode labels, specific UI badges, build expiry
  behavior, and Node version numbers. Some of those are important. Some are maintenance traps. The
  plan does not distinguish stable concepts from volatile labels, so it risks a rewrite that is
  maximally accurate for one commit and decays immediately after.
- The sprint treats the Hugo build as a quality gate it is not. In the **Definition of Done** and
  **Observability & Rollback**, `hugo --minify` is the primary automated verification. That catches
  syntax and missing references, not semantic correctness. A beautifully compiling docs site can
  still be deeply wrong.
- The chosen deliverables for media are weak proxies for actual usability. **Workstream C** produces
  scripts, not captures. **Post-ship** in **Observability & Rollback** only says to spot-check that
  placeholders are "actionable." That is a low bar. An actionable placeholder is not the same as a
  proven, repeatable capture workflow.
- The plan has no explicit strategy for shared concepts that span pages. Continuation policy shows up
  in **Use Cases**, **P0: Must Ship**, and the **Definition of Done** across Concepts,
  Compositions, and Sessions. The document does not define a canonical source page, cross-reference
  rules, or anti-duplication guidance. That is how doc sets drift internally even when each page is
  individually "accurate."

## 4. Gaps In The Definition Of Done

- The **Definition of Done** never requires a human to execute every documented flow in the running
  app. "Reviewed against current renderer source" is not a runtime validation criterion.
- It does not require page-by-page signoff that all screenshots and video placeholders correspond to
  actual insertion points in the docs. A media audit can be "complete" on paper while the pages
  remain inconsistent or over/under-illustrated.
- It does not require verification on multiple platforms, despite the **Overview** explicitly
  naming macOS/Windows/Linux install flows as follow-on capture concerns. If platform-specific
  wording differs now, the sprint has no mechanism to catch it.
- It does not require checking search, navigation, or internal link integrity beyond the Hugo build.
  Rewriting `site/content/docs/_index.md` and cross-linking pages can still leave users with a bad
  reading path even if the site compiles.
- It does not require consistency checks for terminology beyond three banned words. The **Definition
  of Done** says no "agent," "bot," or "roster," but that is a toy check. It does not prove terms
  are used consistently, definitions are introduced once, or pages do not contradict each other.
- It does not require validation that the "keep" assets in the media audit are actually current. The
  **Definition of Done** asks that every asset be classified as `verified-current`,
  `replace-required`, or `new-required`, but it never says what evidence is needed to call something
  `verified-current`. A lazy reviewer can rubber-stamp old assets.
- It does not require any review of accessibility of the rewritten docs. If screenshots, video
  placeholders, and rewritten instructions are unclear to screen-reader users or rely on color-only
  descriptions, this DoD still passes.
- It does not require sanitization review for screenshots and scripts beyond "do not use real API
  keys." The **Security Considerations** are minimal, and the DoD does not enforce them. A script
  can still accidentally instruct users to expose usernames, file paths, machine names, or local
  endpoints.
- It does not require an explicit unresolved-questions log. Given how many assumptions this plan
  makes, the sprint needs a place where ambiguous product behavior is recorded rather than quietly
  guessed. As written, silent guessing still passes.

## 5. Most Likely Failure Mode

The most likely way this sprint fails is not that Hugo breaks. It is that the team ships a
confident, internally consistent, freshly rewritten docs set that is still wrong in critical user
flows because the plan mistakes source review for product verification.

Here is the likely sequence:

1. The team starts from the issues already named in the **Overview** and **P0: Must Ship**.
2. They rewrite pages quickly using renderer source and whatever `e2e` specs exist, because the
   sprint implicitly treats those as authoritative in **Workstream A** and the **Definition of
   Done**.
3. They classify media assets and write placeholders based on that rewritten copy, as required by
   **Workstream B**.
4. They produce polished screenshot and video scripts in **Workstream C** without actually proving
   that the app can be driven through all those states cleanly on demand.
5. `hugo --minify` passes, terminology passes, links mostly pass, and the sprint declares victory
   under the current **Definition of Done**.

Then the first person who actually tries to follow the docs hits one of the states the sprint never
fully validated: a provider card state that only appears with real credentials, an onboarding branch
that behaves differently than the test fixture, a continuation mode edge case that the UI labels
slightly differently at runtime, an About screen field only present on beta builds, or an asset
marked `verified-current` that encodes pre-rewrite behavior.

That is the failure mode to plan against: not obvious breakage, but polished false confidence.

## Bottom Line

This sprint is presentable, but it is still too trusting. The sections that should make an approver
comfortable, especially **Definition of Done**, **Risks & Mitigations**, and **Observability &
Rollback**, are exactly where the plan is weakest. It has production energy and draft-level rigor.

If this plan is approved unchanged, expect one of two outcomes: either the sprint quietly overruns
because the team discovers the real verification burden mid-flight, or it "ships" on time by
lowering the standard of truth without admitting it.
