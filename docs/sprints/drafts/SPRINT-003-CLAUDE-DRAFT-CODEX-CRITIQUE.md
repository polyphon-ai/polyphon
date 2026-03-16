# Formal Critique of `SPRINT-003-CLAUDE-DRAFT.md`

## Overall Assessment

Claude's draft is thoughtful, concrete, and generally strong at turning the Sprint 003 intent
into an implementable plan. Its best qualities are that it identifies the core user-visible flow,
maps that flow onto the main-process/renderer/SQLite boundaries already used by Polyphon, and
defines a clear banner-based experience rather than introducing a broader notification system.

The main problems are not a lack of effort or structure, but a set of scope and consistency
issues. Most importantly, the draft does not consistently resolve the original ambiguity around
auto-install versus notification-only behavior, and several sections contradict each other on
what the sprint actually ships. It also leaves out a few implementation details that matter for
correctness in Electron, database migration hygiene, and GitHub release handling.

## What Claude Got Right

### 1. The draft correctly centers the feature around a minimal, startup-driven notification flow

The `Overview` is a strong translation of the seed intent into product behavior. It correctly
frames the job as:

- checking for updates after startup
- surfacing a persistent banner only when a newer version exists
- giving the user two dismissal choices with different persistence behavior

That is well aligned with the user problem stated in [`SPRINT-003-INTENT.md`](/Users/corey/Code/github.com/polyphon-ai/polyphon/docs/sprints/drafts/SPRINT-003-INTENT.md): users need to know a newer release exists, and the app should not become noisy or blocking.

### 2. The main-process / renderer / SQLite split is mostly well chosen

The `Architecture` section gets the high-level boundaries right:

- main process performs the network check
- renderer only displays state and forwards user actions
- SQLite persists durable preferences
- IPC bridges the two

That is a good fit for the current codebase shape described in the intent's `Relevant Codebase
Areas` and `Constraints`. Claude also avoids proposing renderer-side network fetches or direct DB
access from React, which would have been a poor fit.

### 3. The persistence model captures the two distinct dismissal semantics

Claude does a good job in `Use Cases`, `Architecture`, and `Implementation Plan` of separating:

- per-release permanent dismissal via `dismissed_update_version`
- temporary suppression via `update_remind_after`

That is one of the strongest parts of the draft. It recognizes that "don't remind me again" must
be keyed to the available release version rather than treated as a global opt-out.

### 4. The draft stays implementation-oriented

The `Implementation Plan`, `Files Summary`, and `Definition of Done` are concrete enough that an
engineer could begin work quickly. In particular, these are useful decisions:

- adding a dedicated version-comparison utility in `Version comparison utility`
- putting the startup check in `src/main/index.ts`
- exposing a narrow preload API instead of leaking raw IPC to the renderer
- mounting the banner near `App.tsx` rather than creating a larger toast framework

This keeps the sprint grounded in a minimal path rather than turning it into UI infrastructure work.

## What Claude Missed

### 1. The draft does not resolve the sprint scope consistently

This is the biggest issue.

In `Overview`, Claude says the sprint adds "two capabilities": a notification toast and, on
macOS and Windows, an in-app install mechanism powered by `update-electron-app`.

In `Architecture`, the same assumption continues with:

- "`Install now` button"
- `update-electron-app`
- `autoUpdater` events

But in `Implementation Plan -> P0: Must Ship`, Claude later states:

> `No auto-install this sprint`

and says all platforms use a `Download` link only. The `Definition of Done` reinforces that by
requiring:

- no platform-specific code paths
- no `autoUpdater`
- no Squirrel

These cannot all be true at once. The draft never fully reconciles whether Sprint 003 ships:

1. notifications only, or
2. notifications plus macOS/Windows in-app install

This matters because it changes the required dependencies, UI copy, IPC surface, test plan, CI
assumptions, and risk profile.

### 2. `Remind me later` behavior is internally inconsistent

`Overview` says `Remind me later` is a "session-only dismiss."

`Use Cases` repeats that:

- "reappears next time the app starts"

But `Architecture`, `Implementation Plan -> IPC channels`, and `Definition of Done` all define
`Remind me later` as a persisted 24-hour cooldown stored in SQLite via `update_remind_after`.

This is not a minor wording issue. It changes:

- schema design
- migration requirements
- acceptance criteria
- the user-facing semantics of the banner

The draft should have picked one meaning and carried it consistently across every section.

### 3. The release-fetching design is underspecified for pre-release handling

Claude identifies pre-release handling in `Version comparison utility` and again in `Risks &
Mitigations`, but the actual fetch plan is incomplete.

In `Update checker (main process)`, the draft says to fetch:

- `https://api.github.com/repos/polyphon-ai/releases/releases/latest`

and later says:

- "Filter on `prerelease: false` in the API response"

That is not a complete plan. The `/releases/latest` endpoint already returns GitHub's notion of
the latest non-draft, non-prerelease release. If the code instead needs custom filtering or
channel logic, it likely needs `/releases` rather than `/releases/latest`. As written, the draft
mixes two approaches without explaining which one Polyphon should actually implement.

### 4. The IPC design is missing at least one important renderer initialization path

In `Architecture`, the draft models the system primarily as a main-to-renderer push:

- `update:available`

and in `UpdateBanner component`, it says the banner registers an `onAvailable` listener on mount.

What is missing is a clear answer to this timing question:

- what happens if the main process finishes the update check before the renderer listener is attached?

Because the check runs after window creation and the renderer mounts asynchronously, a pure push
model can race. The draft should either:

- require the check to run after renderer readiness is known, or
- add a query-style IPC like `getUpdateState()` so the renderer can fetch current state on mount

Without that, the banner can be lost non-deterministically.

### 5. Migration naming and scope are not fully coherent

In `Database migration`, Claude lists a file named:

- `002_add_dismissed_update_version.ts`

But the task list then says to create:

- `002_add_update_preferences.ts`

Those imply two different migration names for the same change. That is a small but concrete sign
that the plan was not fully normalized before being written.

The draft also assumes the existing persistence model should be folded into `user_profile row,
id=1` in `Architecture`, but it does not justify why these preferences belong there instead of in
a dedicated update-preferences table. Reusing `user_profile` may still be the right choice, but
the plan treats it as obvious rather than as a design decision with tradeoffs.

### 6. The test plan is thinner than the implementation risk

The `Definition of Done` includes a decent set of checks, but some key cases are still absent:

- malformed or unexpected Git tag shapes
- GitHub API rate-limit responses
- empty or missing `user_profile` data on first run
- renderer subscription cleanup to avoid duplicate listeners
- startup race behavior between `checkForUpdate()` and banner mount

Given that this feature crosses database migration, IPC, renderer state, and startup timing, the
plan needs stronger coverage around failure modes and lifecycle behavior.

## What I Would Do Differently

### 1. Lock the sprint scope before designing architecture

The first thing I would change is to explicitly choose one of these two scopes and reflect it
everywhere:

1. notification-only sprint
2. notification plus install flow on supported platforms

Based on the follow-up reflected in [`SPRINT-003-CODEX-DRAFT.md`](/Users/corey/Code/github.com/polyphon-ai/polyphon/docs/sprints/drafts/SPRINT-003-CODEX-DRAFT.md), I would choose notification-only for Sprint 003 and defer all updater integration. That keeps:

- platform behavior consistent
- tests simpler
- CI dependencies unchanged
- release QA more predictable

If that is the scope, then `Overview`, `Use Cases`, `Architecture`, `Security Considerations`,
and `Open Questions` should all remove references to:

- `Install now`
- `update-electron-app`
- Squirrel
- `autoUpdater.quitAndInstall()`

### 2. Replace the push-only IPC model with request-plus-action IPC

Instead of relying solely on `update:available` events, I would structure the feature around:

- `update:get-state`
- `update:remind-later`
- `update:dismiss-release`

Then the startup flow becomes:

1. main process computes current update state
2. renderer requests that state on mount
3. renderer renders banner if state says it should
4. user actions call narrow mutation IPC handlers

This is more deterministic and easier to test than a race-prone event-only approach.

### 3. Make the release parsing rules explicit

The draft should state, in one place, the exact normalization rules for GitHub tags:

- accept `vX.Y.Z` and normalize to `X.Y.Z`
- reject malformed tags quietly
- ignore prereleases intentionally
- compare normalized versions only

Right now the logic is split between `Version comparison utility`, `Update checker`, and `Risks &
Mitigations`. I would consolidate that into a single "release parsing and comparison" section so
the implementation and tests are driven by one canonical rule set.

### 4. Tighten the persistence design around actual user intent

If `Remind me later` truly means 24 hours, I would say so in `Overview`, `Use Cases`,
`Architecture`, and `Definition of Done` without mentioning session-only behavior anywhere.

I would also be explicit that the permanent dismissal key is the available newer version, not the
running version. Claude implies this in places, but it should be stated directly because it is
core to correct behavior when a newer release supersedes a previously dismissed one.

### 5. Expand the acceptance criteria around lifecycle and failure paths

I would add explicit acceptance criteria for:

- renderer still sees update state if the check finishes before the banner mounts
- invalid GitHub tag data results in no banner and no crash
- first run with default DB values does not error
- offline startup remains silent and non-blocking
- duplicate renderer mounts do not accumulate listeners

Those are the places where this feature is most likely to fail in practice.

## Over-Engineering and Gaps

### 1. The early auto-update architecture is over-engineering for the settled scope

If Sprint 003 is notification-only, then the `Overview`, `Architecture`, `Security
Considerations`, and `Open Questions` sections spend too much energy on a platform-specific
updater stack that the sprint later defers.

That is over-engineering because it adds conceptual and review overhead without delivering
something the final plan actually intends to ship.

### 2. The schema choice is under-argued, while the updater discussion is over-developed

The draft gives substantial space to Squirrel and updater behavior, but comparatively little
reasoning about the data model. The more important near-term design question is not "which
updater package might we use later," but:

- should update notification preferences live in `user_profile` or a dedicated table?

Either answer can work, but the draft should justify the choice because it affects migration
shape, query ergonomics, and future extensibility.

### 3. Some sections still read like two merged plans

The document feels partially composed from both:

- an "install now on macOS/Windows" plan
- a "download only on all platforms" plan

You can see that split across `Overview`, `Architecture`, `Implementation Plan -> P0: Must
Ship`, `Definition of Done`, and `Security Considerations`. That creates review drag because the
reader has to determine which statements are authoritative.

### 4. Documentation updates are incomplete relative to the proposed IPC surface

In `Documentation`, the draft says to update `CLAUDE.md` to include "the four new `update:*`
channels," but the body of the draft only clearly specifies two renderer-facing channels:

- `update:available`
- `update:dismiss`

If there are actually four channels, the plan should name them. If there are only two, the
documentation task should say two. As written, the draft hints at a larger API surface than it
defines.

## Conclusion

Claude produced a strong draft in terms of energy, specificity, and implementation momentum. The
core product instincts are good: non-blocking startup check, minimal banner UI, durable
dismissal behavior, and no unnecessary toast framework.

The document needs one round of tightening before it should be treated as a sprint spec. The
highest-priority fixes are:

1. resolve the scope conflict between notification-only and in-app install
2. make `Remind me later` semantics consistent everywhere
3. replace or supplement the push-only IPC design to avoid renderer startup races
4. clarify release parsing and prerelease-handling rules
5. strengthen acceptance criteria around lifecycle and failure cases

With those changes, the draft would be materially more reliable and easier to implement without
surprises.
