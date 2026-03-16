# Devil's Advocate Review of `SPRINT-003.md`

## Approval Recommendation

Do not approve this sprint as written.

This plan looks neat because it intentionally avoids auto-update complexity. That does not make it
safe. It is still introducing a new startup-time network dependency, new persistence rules, new IPC
surface area, new renderer state, and a user-facing interruption at the root of the app. The
document repeatedly frames that as "awareness first, installation second," but the real shape of
the work is "ship a cross-process notification system and hope the edge cases are boring"
([Overview](../SPRINT-003.md#overview), [Sprint Theme](../SPRINT-003.md#sprint-theme),
[Architecture](../SPRINT-003.md#architecture)).

## 1. Flawed Assumptions

- The plan assumes GitHub's "latest release" is the product's source of truth for upgrade
  awareness. That is only true if every public GitHub release is meant for every app user and the
  app version string always tracks those tags cleanly. If packaging, phased rollouts, or platform
  gaps exist, this banner will advertise builds users may not actually be able to use
  ([Overview](../SPRINT-003.md#overview), [Architecture](../SPRINT-003.md#architecture),
  [Dependencies](../SPRINT-003.md#dependencies)).
- The document assumes `X.Y.Z` is enough version semantics because it wants to avoid a semver
  dependency. That is an engineering convenience masquerading as a product invariant. The moment
  the release process emits build metadata, pre-release suffixes, or a tag like `v0.2`, this
  system silently degrades into "no banner, no explanation"
  ([Implementation Plan: Version comparison utility](../SPRINT-003.md#2-version-comparison-utility),
  [Risks & Mitigations](../SPRINT-003.md#risks--mitigations)).
- The plan assumes "silent failure" is low risk because update awareness is non-critical. That is
  backwards. Silent failure guarantees nobody notices when the feature is broken in production. A
  dead update notifier and a healthy update notifier look identical to the user: both can produce
  no banner
  ([Use Cases](../SPRINT-003.md#use-cases), [Definition of Done](../SPRINT-003.md#definition-of-done),
  [Observability & Rollback](../SPRINT-003.md#observability--rollback)).
- It assumes the startup timing is harmless because the check is asynchronous and happens after the
  window shows. That ignores the real user experience problem: you are still injecting a banner
  into the app shell during initial interaction, possibly over onboarding or another first-run
  moment, and the mitigation is basically "timing is not a concern." That is not evidence; that is
  denial
  ([Overview](../SPRINT-003.md#overview), [Architecture](../SPRINT-003.md#architecture),
  [Risks & Mitigations](../SPRINT-003.md#risks--mitigations)).
- The plan assumes a single-row `user_profile` store is sufficient for all update-notification
  state forever. That works only if the notification model stays trivial. The minute you need
  release-specific metadata, channel-aware behavior, or auditability around why something was
  hidden, this design becomes a dead end
  ([Architecture](../SPRINT-003.md#architecture),
  [Implementation Plan: Database migration](../SPRINT-003.md#1-database-migration)).
- It assumes `shell.openExternal` to the generic releases page is always the right user action.
  That glosses over the possibility that users need a platform-specific asset, install instructions,
  or at least confirmation that a release actually includes their platform
  ([Overview](../SPRINT-003.md#overview), [Use Cases](../SPRINT-003.md#use-cases),
  [Definition of Done](../SPRINT-003.md#definition-of-done)).
- The plan assumes `POLYPHON_E2E` is the only environment that must suppress update checks. That is
  a test-centric assumption, not a system design. Local development, storybook-like renderer runs,
  offline QA, and deterministic integration test environments are all left to incidental behavior
  ([Architecture](../SPRINT-003.md#architecture),
  [Implementation Plan: Update checker](../SPRINT-003.md#4-update-checker),
  [Definition of Done](../SPRINT-003.md#definition-of-done)).

## 2. Scope Risks

- The sprint claims to be a banner, but the actual blast radius spans database schema, migrations,
  query layer, version parsing, network fetch, IPC contracts, preload API, app startup, renderer
  store, a new root component, and tests across all of them. That is not "small awareness work."
  That is a cross-cutting feature touching nearly every layer of the app
  ([Implementation Plan](../SPRINT-003.md#implementation-plan),
  [Files Summary](../SPRINT-003.md#files-summary)).
- The migration is understated. Adding columns is the easy part; the real risk is that every place
  that reads or writes `user_profile` now has to preserve these new fields correctly. The plan says
  "extend `getUserProfile` / `saveUserProfile` queries" but says nothing about partial-update
  behavior, stale writes, or whether existing save paths overwrite the new values accidentally
  ([Implementation Plan: Database migration](../SPRINT-003.md#1-database-migration),
  [Dependencies](../SPRINT-003.md#dependencies)).
- The update checker has hidden dependency risk on GitHub API behavior, Electron fetch support,
  app version formatting, and main-process availability of everything it touches. The plan treats
  that as a single utility file, which is exactly how teams underestimate integration work
  ([Architecture](../SPRINT-003.md#architecture),
  [Implementation Plan: Update checker](../SPRINT-003.md#4-update-checker)).
- The root-mounted banner is scope creep disguised as a component. Once it sits above "all views,"
  it becomes a layout problem, a z-index problem, a spacing problem, and potentially a
  cross-platform chrome problem. Nothing in the sprint budgets time for making sure this does not
  collide with existing global UI
  ([Implementation Plan: UpdateBanner component](../SPRINT-003.md#6-updatebanner-component),
  [Definition of Done](../SPRINT-003.md#definition-of-done)).
- The testing scope is understated. The plan asks for unit tests, integration tests, IPC tests,
  component tests, migration tests, and unchanged e2e behavior, but there is no accounting for how
  network calls are mocked, how `Date.now()` is controlled, or how startup races are deterministically
  exercised. This is a classic sprint plan that budgets code, not test harness work
  ([Implementation Plan](../SPRINT-003.md#implementation-plan),
  [Definition of Done](../SPRINT-003.md#definition-of-done)).
- P1 is not harmless overflow. A manual "Check for updates" button and re-enable action would force
  the team to revisit cache invalidation, current-state semantics, and preference clearing rules.
  That is not a nice extra. It is a second feature that changes the shape of the first one
  ([P1: Ship If Capacity Allows](../SPRINT-003.md#p1-ship-if-capacity-allows),
  [Architecture](../SPRINT-003.md#architecture)).
- The rollback story is too casual. "All changes are additive" is not a real mitigation when the
  feature changes startup behavior and persists new state. Reverting the code while leaving the DB
  changes behind may be harmless today, but the document never proves that no future code path will
  trip over partially populated update columns
  ([Observability & Rollback](../SPRINT-003.md#observability--rollback),
  [Implementation Plan: Database migration](../SPRINT-003.md#1-database-migration)).

## 3. Design Weaknesses

- The architecture uses module-level in-process cache as the source of truth for `get-state`. That
  is a flimsy design. You now have one truth in SQLite and another transient truth in memory, and
  the contract between them is fuzzy. A restart, a manual future re-check, or multiple windows will
  expose how shallow this design is
  ([Architecture](../SPRINT-003.md#architecture),
  [Implementation Plan: IPC channels and shared types](../SPRINT-003.md#3-ipc-channels-and-shared-types),
  [Implementation Plan: Update checker](../SPRINT-003.md#4-update-checker)).
- The renderer is trusted to pass `version` back into `update:dismiss`, even though the main process
  already owns the update state. That is a poor contract. It invites bad writes from stale UI,
  duplicated windows, or accidental misuse of preload methods. The backend should not rely on the
  renderer to tell it which release is currently active
  ([Architecture](../SPRINT-003.md#architecture),
  [Implementation Plan: IPC channels and shared types](../SPRINT-003.md#3-ipc-channels-and-shared-types)).
- The decision to store only a single `dismissed_update_version` is brittle by design. It works for
  the one exact use case the plan names and nothing else. If the release source flips tags, if two
  windows race, if a user dismisses `0.3.0` and then snoozes `0.4.0`, the meaning of the persisted
  state becomes ambiguous fast
  ([Use Cases](../SPRINT-003.md#use-cases), [Architecture](../SPRINT-003.md#architecture)).
- The version parser is intentionally narrow and then treated like a robustness measure. It is not.
  "Reject malformed tags" means "tie product behavior to perfect release hygiene." That is a brittle
  operational dependency, not resilient software design
  ([Architecture](../SPRINT-003.md#architecture),
  [Implementation Plan: Version comparison utility](../SPRINT-003.md#2-version-comparison-utility),
  [Risks & Mitigations](../SPRINT-003.md#risks--mitigations)).
- The plan puts `shell.openExternal` in the renderer banner flow while also claiming URL safety via
  allowlisting. That split responsibility is easy to regret. If URL validation lives in main-process
  handlers elsewhere, this design is inviting inconsistency by letting renderer code drive the last
  step directly
  ([Use Cases](../SPRINT-003.md#use-cases), [Security Considerations](../SPRINT-003.md#security-considerations),
  [Implementation Plan: UpdateBanner component](../SPRINT-003.md#6-updatebanner-component)).
- The "no platform-specific code paths" success criterion is being treated as a virtue when it may
  actually be a symptom of under-design. Cross-platform sameness is not automatically good if it
  means every platform gets the lowest-common-denominator experience
  ([Definition of Done](../SPRINT-003.md#definition-of-done), [Deferred](../SPRINT-003.md#deferred)).
- The architecture has no answer for repeated checks within a single session, stale cache after
  dismissal, or race conditions between `getState()` and an incoming `UPDATE_AVAILABLE`. It relies
  on "both paths set the same store action" as if duplicate or out-of-order events are harmless by
  definition. That is wishful thinking, not event design
  ([Architecture](../SPRINT-003.md#architecture),
  [Risks & Mitigations](../SPRINT-003.md#risks--mitigations),
  [Implementation Plan: UpdateBanner component](../SPRINT-003.md#6-updatebanner-component)).

## 4. Gaps In The Definition Of Done

- The DoD never requires correct behavior on non-200 HTTP responses, only "errors are silent." A
  rate-limited `403`, redirected endpoint, or malformed success payload can all satisfy that and
  still leave the feature dead in the field
  ([Definition of Done](../SPRINT-003.md#definition-of-done),
  [Risks & Mitigations](../SPRINT-003.md#risks--mitigations)).
- It does not require proof that the banner is visually acceptable in the actual app shell. There
  is no acceptance criterion for layout integrity, overlap with existing UI, truncation, focus
  behavior, keyboard accessibility, or screen-reader semantics. A banner can technically render and
  still be obnoxious or broken
  ([Definition of Done](../SPRINT-003.md#definition-of-done),
  [Implementation Plan: UpdateBanner component](../SPRINT-003.md#6-updatebanner-component)).
- It does not require verification that dismissal and snooze state survive the app's normal profile
  lifecycle beyond the happy path. There is no criterion for profile creation, corrupted rows,
  missing row `id=1`, or old DBs that already contain unexpected schema drift
  ([Definition of Done](../SPRINT-003.md#definition-of-done),
  [Dependencies](../SPRINT-003.md#dependencies),
  [Implementation Plan: Database migration](../SPRINT-003.md#1-database-migration)).
- The DoD never checks that `update:get-state` and `update:available` cannot disagree. It verifies
  that each can work individually, not that the combined protocol is coherent under race
  conditions
  ([Definition of Done](../SPRINT-003.md#definition-of-done),
  [Architecture](../SPRINT-003.md#architecture)).
- There is no acceptance criterion for timezone, clock skew, or invalid system clock handling even
  though the entire snooze feature depends on comparing `Date.now()` to persisted millisecond
  timestamps. If a user's clock is wrong, the feature can stay hidden for absurdly long periods and
  still technically satisfy the written plan
  ([Use Cases](../SPRINT-003.md#use-cases), [Architecture](../SPRINT-003.md#architecture)).
- The DoD never requires test coverage for the exact version strings returned by the real release
  pipeline. It has generic unit cases, but nothing that proves the current app version and current
  GitHub tags are actually compatible with the comparison logic
  ([Definition of Done](../SPRINT-003.md#definition-of-done),
  [Implementation Plan: Version comparison utility](../SPRINT-003.md#2-version-comparison-utility),
  [Observability & Rollback](../SPRINT-003.md#observability--rollback)).
- It says "same on macOS, Windows, Linux" for opening the releases page, but does not require any
  validation that packaged builds on those platforms actually permit the call path being used. That
  is not cross-platform verification; that is copywriting
  ([Use Cases](../SPRINT-003.md#use-cases),
  [Definition of Done](../SPRINT-003.md#definition-of-done)).
- The existing e2e suite passing unchanged is too weak a guardrail. It proves the escape hatch
  works for one environment variable. It does not prove the new feature is testable, deterministic,
  or observable anywhere else
  ([Definition of Done](../SPRINT-003.md#definition-of-done),
  [Implementation Plan: Update checker](../SPRINT-003.md#4-update-checker)).

## 5. Most Likely Failure Mode

The most likely way this sprint fails is not a crash. It is a deceptively "successful"
implementation that passes the current DoD while being operationally untrustworthy.

Here is the likely sequence:

1. The team implements the migration, simple version parser, fetch logic, and banner exactly as
   described because the plan is explicit enough on happy-path code structure
   ([Implementation Plan](../SPRINT-003.md#implementation-plan)).
2. Real-world variability shows up immediately: a release tag format drifts, GitHub rate-limits a
   subset of users, the app version string does not match the parser's assumptions, or the root
   banner appears in an awkward first-run moment. The plan has already normalized all of those as
   either "silent failure" or "timing is not a concern"
   ([Risks & Mitigations](../SPRINT-003.md#risks--mitigations),
   [Implementation Plan: Version comparison utility](../SPRINT-003.md#2-version-comparison-utility),
   [Use Cases](../SPRINT-003.md#use-cases)).
3. QA can still pass the feature locally by forcing a low app version and manually confirming the
   happy path, because that is exactly what the verification section tells them to do
   ([Observability & Rollback](../SPRINT-003.md#observability--rollback)).
4. Production then ends up with a notifier that is brittle, invisible when broken, and hard to
   reason about because its state is split between SQLite, module cache, renderer store, and remote
   GitHub data
   ([Architecture](../SPRINT-003.md#architecture),
   [Implementation Plan: IPC channels and shared types](../SPRINT-003.md#3-ipc-channels-and-shared-types),
   [Implementation Plan: Update checker](../SPRINT-003.md#4-update-checker)).

That is the likely failure: the sprint "ships" and even demos well, but the feature cannot be
trusted. Users either never see it when they should, or see it at the wrong time, and the plan has
deliberately chosen silence in most failure modes so the team learns about the problem late.

## Bottom Line

This plan is underestimating how much product behavior it is smuggling into a seemingly modest
notification banner.

It assumes release hygiene, version-format hygiene, layout safety, startup timing safety, and
cross-process state coherence without proving any of them. The document is strong on happy-path
implementation detail and weak on operational honesty. That is not enough for approval.
