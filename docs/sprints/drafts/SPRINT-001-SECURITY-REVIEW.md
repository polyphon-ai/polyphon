# Sprint 001 Security Review

## Summary

Sprint 001 is a docs-only sprint with no application code changes. The attack surface is
minimal — no new inputs, APIs, trust boundaries, parsers, or auth flows are introduced.
However, there are a small number of content-level and process-level security considerations
worth noting.

---

## Attack Surface

**Rating: Low**

No new code is shipped. The sprint produces:
- Hugo Markdown files (docs pages)
- Two Markdown guide files (screenshot/video scripts)

Hugo renders Markdown to static HTML. No server-side code, no dynamic inputs, no API
endpoints are added.

---

## Data Handling

**Rating: Low**

No user data is introduced. The docs describe user-facing features (including avatar upload
and conductor profile) but the documentation itself does not handle, store, or transmit any
user data.

**One consideration:** The screenshot script and video scripts must not instruct users to enter
real API keys on screen for capture purposes. The Security Considerations section of SPRINT-001.md
already calls this out. Ensure `docs/screenshot-script.md` includes explicit guidance like
"use a test/placeholder key" or "blur/crop the API key field in post".

**Mitigation already in plan:** Yes — "Screenshot/video scripts must not instruct users to enter
real API keys on screen" is in the Security Considerations section.

---

## Injection and Parsing Risks

**Rating: Low**

Hugo processes Markdown files. The risk surface is:
- Injected HTML in Markdown (Hugo default: render raw HTML in Markdown unless `unsafe: false`)
- Video embed shortcodes: `{{< video src=... >}}` — these are Go template calls, not raw HTML,
  and the shortcode is already defined in the site

No new shortcodes or template machinery are introduced. Existing `{{< video >}}` shortcode is
in use today.

**Minor risk:** If a placeholder contains HTML (e.g., `<!-- comment -->`) with a malformed tag,
Hugo may render it unexpectedly. This is low-impact on a static docs site with no user inputs.

---

## Authentication / Authorization

**Rating: None**

This sprint adds no auth flows. The docs describe API key handling (Settings pages) but do not
implement any auth functionality. No new IPC channels, no new DB queries, no new network calls.

---

## Dependency Risks

**Rating: Low — no new dependencies**

The sprint adds no npm packages, no Hugo plugins, no new CI actions. Hugo is already in use.

---

## Threat Model

Given the project context (local-first Electron desktop app, no cloud dependency, no telemetry
by default), the realistic threat model for a docs-only sprint is:

1. **Leaked credentials in screenshots** — If a human capturing screenshots pastes a real API
   key for "realism" and the screenshot is published. Mitigation: capture script must explicitly
   say "use placeholder keys" and "blur key fields".

2. **Stale security advice in docs** — If docs describe the API key resolution mechanism
   inaccurately and users believe their keys are handled differently than they are. The docs
   should state what the code actually does (keys stored in local DB, never logged, never sent
   to renderer). The `providers.md` page already says this accurately; the update must preserve
   this language.

3. **External link rot to provider consoles** — If provider console URLs in the docs point to
   phished or redirected destinations. Mitigation: only link to known-canonical URLs
   (console.anthropic.com, platform.openai.com, aistudio.google.com, ollama.com). The plan's
   domain-audit task covers this.

---

## Findings Summary

| Finding | Rating | Section | Mitigation |
|---|---|---|---|
| Screenshots may expose real API keys if capture instructions are vague | Low | Security Considerations | Add explicit "use placeholder key / blur key field" instruction in screenshot script |
| Stale security language in providers.md could be introduced during rewrite | Low | providers.md update task | Preserve existing accurate security language about key handling in providers.md |
| External links could rot to redirected / phished destinations | Low | docs-wide link audit task | Audit task already in P0; confirm only canonical URLs are used |

**No Critical or High findings.** No security-related DoD additions are required beyond what is
already in the plan. The Low findings are addressed by existing plan items.
