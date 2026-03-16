# Devil's Advocate Review of `SPRINT-002.md`

## Approval Recommendation

Do not approve this sprint as written.

The document is tidy, but it is far too confident for a plan whose core promise is "make the
walkthrough more educational" by touching a single brittle capture script. The plan keeps
pretending this is a low-risk narration polish pass. It is not. It is a long, timing-sensitive,
provider-dependent UI recording flow that is being made longer, more stateful, and more dependent
on non-deterministic model behavior. That is exactly how you create a demo that looks great in the
plan and flakes in reality.

## 1. Flawed Assumptions

- The **Overview** claims "feeding them richer cues is the correct lever" and explicitly limits the
  sprint to "surgical changes to `take-videos.ts` only" ([Overview](../SPRINT-002.md#overview),
  lines 10-18). That assumes the thin narration problem is mostly a cue-quality problem rather than
  a capture-design problem. It may be the opposite. If the visuals are still too fast, too dense,
  or poorly sequenced, better prose just narrates confusion more eloquently.
- **Workstream A** and **P0: Settings: dwell times and cue contexts** assume that holding static
  Settings screens for 9 seconds makes them educational ([Workstream A](../SPRINT-002.md#workstreams),
  lines 34-36; [P0](../SPRINT-002.md#implementation-plan), lines 60-83). That is a lazy proxy for
  comprehension. A longer pause is not explanation. It is just dead air unless the screen itself
  reveals something meaningful.
- The provider copy assumes facts that may not hold on the capture machine: model selectors appear,
  API key badges confirm connection, OpenAI refresh populates the latest models, CLI mode is
  installed and usable, and Gemini has exactly one visible toggle row ([P0: provider cue contexts](../SPRINT-002.md#implementation-plan),
  lines 71-83). Several of those are runtime-state claims, not durable product truths.
- The plan assumes the "Prompt me" continuation demo is reliable enough to become the centerpiece of
  the broadcast section ([Use Cases](../SPRINT-002.md#use-cases), line 26; [Workstream C](../SPRINT-002.md#workstreams),
  lines 43-46; [Broadcast session](../SPRINT-002.md#implementation-plan), lines 126-160). That is
  wishful thinking. The models have to want to continue, the banner has to appear in time, and the
  UI has to surface it clearly. None of that is deterministic.
- The claim that cloud and local providers are "interchangeable" and that "no provider is
  first-class" is marketing language masquerading as an implementation fact ([Workstream B](../SPRINT-002.md#workstreams),
  lines 38-41; [P0: custom provider cues](../SPRINT-002.md#implementation-plan), lines 79-83;
  [Session 4](../SPRINT-002.md#implementation-plan), lines 174-236). They are not interchangeable
  if latency, availability, auth, failure modes, model pickers, or prompt behavior differ in ways
  the UI leaks.
- The **Open Questions** section says everything is resolved ([Open Questions](../SPRINT-002.md#open-questions),
  lines 360-365). No, it is not. The plan still assumes exact selector stability, model behavior,
  video pacing, and provider setup quality without proving any of them.

## 2. Scope Risks

- The sprint keeps saying "take-videos.ts only" as if one file means one small change ([Overview](../SPRINT-002.md#overview),
  lines 10-18; [Files Summary](../SPRINT-002.md#files-summary), lines 270-275). That is false
  comfort. This one file already owns onboarding, settings, provider setup, custom providers,
  composition building, session launching, recording, cue timing, and narration text. You are not
  making a small change. You are increasing complexity in the single most overloaded script in the
  workflow.
- The new scope adds a fourth composition, a fourth session, a live continuation branch, longer
  settings dwell, new closing logic, and a narration rewrite in one sprint ([Workstreams B-D](../SPRINT-002.md#workstreams),
  lines 38-50; [P0](../SPRINT-002.md#implementation-plan), lines 99-249). That is not "richer
  walkthrough." That is a materially longer end-to-end recording with more opportunities for flake,
  timeout, and pacing collapse.
- **Dependencies** casually require Ollama models plus Anthropic, OpenAI, and Gemini API keys
  configured in-app, plus `ANTHROPIC_API_KEY` for narration and `OPENAI_API_KEY` for voiceover
  ([Dependencies](../SPRINT-002.md#dependencies), lines 349-356). That is a four-provider capture
  environment plus two env-var pipelines. The plan is underplaying how hostile that is to repeatable
  execution.
- The hybrid session is a hidden dependency chain: Anthropic must be configured and healthy, Ollama
  must be running with the right model, the composition builder must expose both, the session must
  start, targeted mentions must work twice, and both voices must answer in time ([Composition 4](../SPRINT-002.md#implementation-plan),
  lines 99-124; [Session 4](../SPRINT-002.md#implementation-plan), lines 174-236). Any weak link
  makes the headline "hybrid" story fall apart.
- **P1** pretends the System Prompts tab interaction is optional garnish, but clicking seeded
  templates introduces another state assumption: seeded data must exist and render consistently
  ([P1](../SPRINT-002.md#implementation-plan), lines 251-260). This is exactly the kind of
  "small extra" that turns a stable flow into a flaky one.
- The plan ignores runtime cost inflation. `wait()` is globally scaled by `TIMING_SCALE = 3` in the
  current script, so every "9 second" dwell is actually 27 seconds of wall-clock capture time
  (`scripts/take-videos.ts`, lines 58-62). The sprint talks about a few extra seconds as if they are
  cheap. They are not.

## 3. Design Weaknesses

- The architecture is still a monolithic imperative script, and this plan doubles down on that
  choice instead of treating it as the risk it is ([Overview](../SPRINT-002.md#overview), lines
  10-18; [Files Summary](../SPRINT-002.md#files-summary), lines 270-275). Every new branch is more
  copy-pasted Playwright code, more hard-coded waits, and more cue emissions stitched directly to UI
  interactions. This will get harder to debug every sprint.
- The plan is built on brittle selectors and positional assumptions but treats them as solved. The
  provider walkthrough relies on exact row ordering, and the new continuation selector is justified
  only because it exists elsewhere in the same file ([P0: continuation policy setup](../SPRINT-002.md#implementation-plan),
  lines 87-95; [Risks & Mitigations](../SPRINT-002.md#risks--mitigations), lines 311-315). That is
  not validation. It is circular reasoning.
- The continuation demo design is especially weak because the fallback path still emits a success-ish
  cue when the real feature does not occur ([Broadcast session](../SPRINT-002.md#implementation-plan),
  lines 135-160; [Risks & Mitigations](../SPRINT-002.md#risks--mitigations), line 311). If the nudge
  never appears, the plan quietly degrades into "broadcast session complete" and keeps going. That
  means the sprint can claim to have implemented the showcase feature while not actually showing it.
- The plan keeps encoding product claims in narration strings instead of verifying them in the UI.
  Examples: "no provider is first-class," "cloud and local providers are peers," "same workflow,
  same interface," and "completely private" ([P0: cue contexts](../SPRINT-002.md#implementation-plan),
  lines 79-83, 170-172, 191-235). That is an anti-pattern. The more the copy editorializes, the
  easier it is for the video to overpromise beyond what the screen proves.
- The VTT overlap fix is crude and symptomatic: "insert 2.5 seconds of waiting" ([Broadcast session](../SPRINT-002.md#implementation-plan),
  lines 128-133). That is not solving timestamp semantics. It is stuffing padding into a timing bug
  and hoping the narration pipeline stops tripping over it.
- The plan refuses to question whether the walkthrough should even be one giant track. Instead it
  keeps piling more concepts into the single full walkthrough asset ([Overview](../SPRINT-002.md#overview),
  lines 16-18; [Generated outputs to inspect](../SPRINT-002.md#files-summary), lines 276-283). If
  this video becomes bloated or fragile, the architecture gives you exactly one failure domain:
  everything.

## 4. Gaps In The Definition Of Done

- The **Definition of Done** never requires the continuation nudge to appear in the final video. It
  only requires the `continuation-nudge-visible` cue to be present in JSON ([Definition of Done](../SPRINT-002.md#definition-of-done),
  lines 294-299). A cue file is not evidence that the banner was legible, on screen long enough, or
  even visually meaningful.
- It never requires the hybrid session to finish successfully with both providers visibly
  responding. "Has >=2 substantive in-session cues" is laughably weak ([Definition of Done](../SPRINT-002.md#definition-of-done),
  lines 297-299). Two cues can be emitted around a broken or misleading session.
- It does not require proof that the narrated claims match actual visible UI states. For example,
  "API key badge confirms the connection" and "model selector appears" are never validated beyond
  textual cues ([P0: provider cue contexts](../SPRINT-002.md#implementation-plan), lines 74-77;
  [Definition of Done](../SPRINT-002.md#definition-of-done), lines 291-303).
- It does not require a human review of whether the walkthrough is watchable. "Pacing is
  comfortable" appears in generated outputs to inspect, but it is not part of the DoD
  ([Files Summary](../SPRINT-002.md#files-summary), lines 276-283; [Definition of Done](../SPRINT-002.md#definition-of-done),
  lines 287-303). That is backward. User experience is the whole point of this sprint.
- The DoD treats `make videos-walkthrough` and `make narration-walkthrough` as sufficient, but those
  commands only prove the pipeline ran, not that the story is coherent or the claims are accurate
  ([Definition of Done](../SPRINT-002.md#definition-of-done), lines 289-303).
- There is no requirement that the script fail loudly when key demo promises do not happen. The plan
  allows the continuation branch and model refresh branch to be conditional, but the DoD does not
  distinguish "feature demonstrated" from "feature narrated around" ([P0: broadcast session](../SPRINT-002.md#implementation-plan),
  lines 135-160; [Risks & Mitigations](../SPRINT-002.md#risks--mitigations), lines 311-315).
- There is no DoD item for runtime budget, only output size budget ([Definition of Done](../SPRINT-002.md#definition-of-done),
  lines 289-303). Given the added waits and provider calls, capture time is an obvious operational
  risk and the plan ignores it.

## 5. Most Likely Failure Mode

The most likely way this sprint fails is simple: the team "ships" a longer walkthrough whose
headline moments are either flaky or fake.

Here is the likely sequence, all supported by the current plan:

1. The team increases dwell times, rewrites cue strings, and adds the hybrid session because those
   are straightforward code edits in **P0** ([Implementation Plan](../SPRINT-002.md#implementation-plan),
   lines 60-249).
2. The continuation nudge proves unreliable, so the existing `try/catch` style fallback remains the
   escape hatch, exactly as endorsed in **Risks & Mitigations** ([Risks & Mitigations](../SPRINT-002.md#risks--mitigations),
   line 311).
3. The OpenAI refresh and hybrid Anthropic path are also flaky, but the plan already normalizes
   conditional behavior and soft failure ([Risks & Mitigations](../SPRINT-002.md#risks--mitigations),
   lines 314-315).
4. The generated cues and VTT look richer on paper, so the sprint passes the current **Definition of
   Done** anyway ([Definition of Done](../SPRINT-002.md#definition-of-done), lines 289-303).
5. The actual output is a bloated walkthrough where the "live continuation demo" may not visibly
   occur, the hybrid story may not convincingly land, and the narration says more than the screen
   proves.

That is the likely failure: not a hard crash, but a polished lie. The sprint is optimized to
improve artifacts that are easy to inspect after the fact, not to guarantee the important moments
were captured cleanly.

## Bottom Line

This plan is overconfident, under-specified, and far too forgiving of partial failure.

The document keeps treating unreliable runtime behavior as if better wording will tame it. It will
not. Right now the sprint is designed to pass even if the most marketable new feature, the live
continuation demo, fails to manifest on screen. That alone should block approval.
