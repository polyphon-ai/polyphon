# Sprint 003 Security Review

## Summary

Sprint 003 adds a GitHub API call on startup and an IPC surface for update-preference persistence.
The attack surface is narrow and the trust model is simple (public read-only API, no auth). No
Critical or High findings. All findings are Low.

---

## Attack Surface Analysis

| New surface | Trust level | Notes |
|---|---|---|
| GitHub API GET `/releases/latest` | Remote, public, unauthenticated | Returns JSON; read-only; no credentials |
| `update:get-state` IPC invoke | Renderer → main | Returns cached `UpdateInfo \| null` |
| `update:dismiss` IPC invoke | Renderer → main | Writes to user_profile in SQLite |
| `window.polyphon.update.*` preload API | Renderer-callable | Exposed via `contextBridge` |
| `html_url` value passed to `shell.openExternal` | GitHub-provided URL | Used as-is; existing allowlist applies |

---

## Finding 1 — `html_url` used as-is in `shell.openExternal` (Low)

**Section:** Architecture / IPC channels / Use Case 5

**Description:** The `releaseUrl` value is taken directly from the GitHub API's `html_url` field
and passed to `shell.openExternal`. If a malicious actor were able to inject an unexpected URL
into a GitHub release response (e.g., via a MITM on unprotected network, or a compromised
GitHub account), a non-`github.com` URL could be delivered to the renderer.

**Context:** The existing `shell:openExternal` IPC handler in `src/main/ipc/index.ts` already
has a `github.com` allowlist (confirmed by recent commits). The `releaseUrl` from `/releases/latest`
will always be a `github.com/polyphon-ai/releases/releases/tag/...` URL.

**Mitigation:** Verify in `checkForUpdate` that `html_url` begins with `https://github.com/`
before caching it. One-line guard; belt-and-suspenders against unexpected API shapes.

**Severity: Low** — allowlist in handler provides defense-in-depth; this is belt-and-suspenders.

**Recommendation:** Add `if (!releaseUrl.startsWith('https://github.com/')) return` after
parsing `html_url` in `updateChecker.ts`.

---

## Finding 2 — No HTTPS certificate validation / TLS enforcement documented (Low)

**Section:** Implementation Plan → Task 4

**Description:** The plan uses `fetch()` (built-in) to call the GitHub API. Node's `fetch` uses
the system TLS store and validates certificates by default. No custom `rejectUnauthorized: false`
or similar override is in scope, so this is not a current vulnerability — but it should be
documented as a constraint so future maintainers don't loosen it.

**Severity: Low** — `fetch` defaults are secure; this is a documentation gap only.

**Recommendation:** Add to DoD: "HTTPS fetch uses default TLS validation; no `rejectUnauthorized`
override."

---

## Finding 3 — `User-Agent` header exposes version (Low, informational)

**Section:** Implementation Plan → Task 4 (`User-Agent: polyphon/{version}`)

**Description:** Sending the app version in the `User-Agent` header is required by the GitHub API
(unauthenticated requests without a UA are rejected). The version is already public (GitHub
releases page). This is not a vulnerability but is worth acknowledging.

**Severity: Low / Informational** — version disclosure is intentional.

---

## Finding 4 — `update:dismiss` can be called with arbitrary version strings (Low)

**Section:** IPC channels / Implementation Plan → Task 3

**Description:** `update:dismiss({ version: string, permanently: boolean })` writes the version
string directly to `dismissed_update_version` in SQLite. The renderer could call this with any
string (e.g., an empty string, a very long string, or a crafted value). The version is never
executed, only compared with `!==` in the next startup check, so the risk is minimal.

**Mitigation:** The main process handler should validate that the version string matches a
reasonable pattern (e.g., `/^\d+\.\d+\.\d+/`) before writing to DB. This prevents junk from
accumulating and makes the behavior predictable.

**Severity: Low** — stored value is only used for string comparison, never executed.

**Recommendation:** Add a `if (!/^\d+\.\d+\.\d+/.test(version)) return` guard in the
`update:dismiss` IPC handler.

---

## Finding 5 — GitHub API rate limit could affect all users behind NAT with shared IP (Low)

**Section:** Risks & Mitigations

**Description:** The unauthenticated GitHub API rate limit is 60 requests/hour per IP. In
enterprise/shared-network environments, many Polyphon instances behind the same NAT could
collectively exhaust this limit. The plan already handles API errors silently, so this degrades
gracefully (no banner). No user data is at risk.

**Severity: Low** — graceful degradation already in plan.

---

## Threat Model

**Realistic adversarial scenario:** A MITM attacker on an untrusted network intercepts the
GitHub API response and substitutes a crafted JSON payload with a malicious `html_url`. The
`html_url` is cached in the main process and eventually passed to `shell.openExternal` by the
renderer.

**Mitigations that reduce this risk to negligible:**
1. HTTPS + certificate validation (default `fetch` behavior)
2. GitHub API is served over HTTPS with a CA-validated certificate
3. `shell.openExternal` allowlist (existing) limits URLs to `github.com`
4. Finding 1 mitigation adds a URL prefix check in `checkForUpdate`

With all three layers in place, a successful MITM would require forging a valid GitHub TLS
certificate, which is outside the threat model for a desktop app.

---

## Summary Table

| Finding | Severity | Incorporated into plan? |
|---|---|---|
| `html_url` URL prefix validation | Low | **Yes** — add guard in `updateChecker.ts`; add to DoD |
| HTTPS TLS constraint documentation | Low | **Yes** — add to DoD |
| User-Agent version disclosure | Low / Informational | No action needed |
| `update:dismiss` version string validation | Low | **Yes** — add guard in IPC handler |
| Rate limit shared IP degradation | Low | Already handled (silent failure) |

No Critical or High findings. The three Low action items above are added to the sprint DoD.
