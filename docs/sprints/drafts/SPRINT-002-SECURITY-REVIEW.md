# Sprint 002 Security Review

## Scope

This sprint modifies `scripts/take-videos.ts` only. It is a capture-script improvement:
no production code, no new APIs, no new dependencies, no user-facing code changes. Security
surface area is minimal.

## Findings

### Low: Walkthrough video may expose test credentials on screen

**Risk:** The walkthrough tours the Providers settings tab, which shows API key badges and
fields. If the capture machine has real API keys configured, they may appear on screen
(masked or partially masked) in the recorded video.

**Context:** The current script already does this; the sprint does not make this worse. But the
longer settings dwell times (9s per tab) increase the time each potentially-sensitive field is
visible.

**Mitigation:** The DoD already includes "No API keys appear in the video." The script should
use the app's built-in key masking, which is already in place. Verify that API key fields show
masked values (`••••••••`) in the recording before publishing the video. No code change needed.

**Rating: Low**

---

### Low: Ollama base URL in captured video reveals local network topology

**Risk:** The walkthrough shows filling in `http://localhost:11434/v1` as the Ollama base URL.
For most users this is a non-secret localhost URL, but if the capture machine uses a different
local hostname or a network-accessible Ollama URL, it would be visible in the recording.

**Mitigation:** The script already hard-codes `http://localhost:11434/v1` (not read from env).
No code change needed; just verify the capture machine's Ollama is on localhost.

**Rating: Low**

---

### Low: Generated video files committed to git

**Risk:** The sprint regenerates `full-walkthrough.mp4` and `full-walkthrough-with-voice.mp4`,
which are committed to the repo under `site/static/videos/`. Large binary files in git have no
security implication but can contain accidentally-captured personal data (e.g., real name,
profile photo, background visible in UI).

**Mitigation:** The script uses seeded profile data (name "Corey", pronouns "they/them",
a generic bio). No personal or sensitive data is entered during capture. Review the video
before committing.

**Rating: Low**

---

## No Critical or High Findings

This sprint introduces no new attack surface, no new network calls, no new parsing, no new
authentication flows, and no new dependencies. All production code and runtime behavior is
unchanged.

## Summary

All findings are Low severity and are either already mitigated by existing practices or require
a manual pre-publish video review (which is already standard for video content).

No changes to `SPRINT-002.md` are needed based on security findings.
