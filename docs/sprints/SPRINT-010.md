# Sprint 010: loadShellEnv() Security Hardening

## Overview

`loadShellEnv()` in `src/main/utils/env.ts` spawns the user's login shell with `-ilc` to
capture the full shell environment and merge it into `process.env`. This is an intentional
product feature — GUI apps launched from the Dock or Spotlight inherit a minimal environment
that often lacks API keys set in `.zshrc`/`.bash_profile`. The function is correct and
well-structured, but the parsing loop has no defensive bounds: it accepts arbitrarily large
payloads, merges env var names with non-standard characters, and writes values of any length.

This sprint makes three targeted additions. First, a documentation block that explains the
security trade-off explicitly — why `-ilc` is used, what it means for shell init files to run
in Polyphon's process space, why this is acceptable for a local-first app, and why the feature
is gated to non-Windows platforms. Second, a 512K-character payload size cap and a per-variable
filter (names must match `[A-Z0-9_]+`; values ≤ 8KB) — both implemented inside a new exported
`parseEnvBlock()` helper (returning `boolean`) that replaces the existing inline loop. Third,
unit tests covering all filter conditions and boundary cases.

---

## Use Cases

1. **Standard uppercase env vars are merged normally** — a user with a typical `.zshrc`
   exporting `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, and similar uppercase keys passes all
   guards. Note: lowercase env var names (e.g. `nvm_dir`, `npm_config_prefix`) are filtered
   out by `ENV_KEY_RE` — this is a policy change from the pre-sprint behavior, which merged
   all keys regardless of case. The key-name filter is the intended behavior per the seed.
2. **Pathological env block triggers size cap; fallback shell is tried** — a user whose
   `.zshrc` produces a 2MB captured block gets a dev-mode warning from `parseEnvBlock`
   (suppressed in production builds); `loadShellEnv` receives `false` and `continue`s to
   the next candidate shell (`/bin/bash`). If bash produces a smaller block, it is processed
   normally. If all candidates exceed the cap, the app starts without shell-sourced API keys
   — there is no production-visible error in this case.
3. **Non-standard key name is skipped per-variable** — a plugin exports `my.plugin.VAR=value`;
   the dotted name fails `ENV_KEY_RE`; the key is skipped with a dev-mode log; all
   `[A-Z0-9_]`-named vars in the same block are merged normally.
4. **Oversized value is skipped per-variable** — one env var has a 10KB value; only that
   entry is dropped (key name logged in dev mode); the rest of the block proceeds.
5. **Security rationale is visible to contributors** — the comment block makes the `-ilc`
   choice and the process-space implication explicit; no future developer needs to rediscover
   this context.

---

## Architecture

The inline loop in `loadShellEnv()` is replaced by a call to `parseEnvBlock()`. The helper
returns `boolean` so `loadShellEnv` can `continue` to the next candidate shell when the size
cap fires, preserving the existing fallback behavior.

```
loadShellEnv() [signature unchanged]
  ├── if win32 → return (unchanged)
  ├── for each shell in candidates:
  │     spawn shell with -ilc (unchanged)
  │     if spawn failed → continue (unchanged)
  │     split on DELIM; check parts.length < 2 → continue (unchanged)
  │     if !parseEnvBlock(parts[1]!) → continue  ← NEW: try next shell on oversized block
  │     return                                    ← unchanged: exit on success
  └── (fall through: no shell succeeded)

parseEnvBlock(block: string): boolean
  ├── if block.length > SHELL_ENV_MAX_LEN → log warn (dev mode) + return false
  └── for each line of block.split('\n'):
        eq = line.indexOf('=')
        if eq <= 0 → skip
        key = line.slice(0, eq)
        value = line.slice(eq + 1)
        if !ENV_KEY_RE.test(key) → log key name (dev mode) + continue
        if value.length > ENV_VALUE_MAX_BYTES → log key name (dev mode) + continue
        process.env[key] = value
  └── return true

Exported constants (for use in tests):
  export const SHELL_ENV_MAX_LEN = 512 * 1024   // UTF-16 code units (≈ bytes for ASCII)
  export const ENV_VALUE_MAX_BYTES = 8 * 1024   // string length in same units
  export const ENV_KEY_RE = /^[A-Z0-9_]+$/

Dev-mode guard (matches fieldEncryption.ts):
  if (process.env.NODE_ENV !== 'production') { console.warn('[loadShellEnv] ...') }
```

**Notes on constants:**
- `SHELL_ENV_MAX_LEN` counts JavaScript string `.length` (UTF-16 code units), not UTF-8
  bytes. For ASCII-only env var content this is equivalent to bytes. The name reflects the
  actual implementation rather than making a byte-count claim.
- `ENV_KEY_RE` allows digit-leading names (e.g. `1FOO`), which the seed specifies; strict
  POSIX convention (`[A-Z_][A-Z0-9_]*`) is slightly tighter. Digit-leading names are
  nonexistent in practice; using the seed-specified pattern.

---

## Implementation Plan

### P0: Must Ship

**Files:**
- `src/main/utils/env.ts` — extend existing comment block; export constants; add
  `parseEnvBlock()` with `boolean` return; update `loadShellEnv()` call site
- `src/main/utils/env.test.ts` — add `describe('parseEnvBlock')` test block

#### 1. `src/main/utils/env.ts` — security comment block

**Tasks:**
- [ ] **Extend** (do not add alongside) the existing comment block above `loadShellEnv()`.
      The existing text covers the Dock/Spotlight motivation; add the security rationale
      below it. The combined comment must cover:
  - Why `-ilc` is passed: `-i` interactive (loads aliases/functions); `-l` login (sources
    `.zshrc`/`.bash_profile` etc. so API keys are available); `-c` runs the capture command
    and exits
  - Security implication: the user's shell init files execute inside Polyphon's process
    space during this call
  - Why this is acceptable: controlling `~/.zshrc` is equivalent to owning the account — a
    user who can modify their own shell config can already run arbitrary code as themselves;
    this is correct and intentional for a local-first desktop app
  - Why the Windows early-return exists: no POSIX login shell convention on Windows;
    environment propagation works differently; `-ilc` semantics are not portable to `cmd.exe`
    or PowerShell
  - The comment must not soften or sanitize the process-space implication

#### 2. `src/main/utils/env.ts` — constants and `parseEnvBlock()` helper

**Tasks:**
- [ ] Export module-level constants:
  ```ts
  export const SHELL_ENV_MAX_LEN = 512 * 1024;  // JS string .length units (≈ bytes for ASCII)
  export const ENV_VALUE_MAX_BYTES = 8 * 1024;
  export const ENV_KEY_RE = /^[A-Z0-9_]+$/;
  ```
- [ ] Add `export function parseEnvBlock(block: string): boolean`:
  - First check: if `block.length > SHELL_ENV_MAX_LEN`, log a dev-mode warning and
    **return `false`** (so `loadShellEnv` can `continue` to the next candidate shell).
    Warning text: `[loadShellEnv] env block exceeds size cap; skipping shell env merge —
    API keys from shell config will not be available from this shell`
  - Split on `'\n'`; for each line find the first `=` (`line.indexOf('=')`)
  - Skip lines where `eq <= 0` (no `=`, or `=` at position 0)
  - `key = line.slice(0, eq)`, `value = line.slice(eq + 1)`
  - If `!ENV_KEY_RE.test(key)`: log `[loadShellEnv] skipping env var with non-standard
    name: ${key}` in dev mode; `continue`
  - If `value.length > ENV_VALUE_MAX_BYTES`: log `[loadShellEnv] skipping env var with
    oversized value: ${key}` in dev mode; `continue`
  - `process.env[key] = value`
  - After the loop, **return `true`**
  - Dev-mode guard: `if (process.env.NODE_ENV !== 'production')` (consistent with
    `src/main/security/fieldEncryption.ts`)
  - Rationale for direct `process.env` mutation: mirrors the existing function's behavior;
    all callers of `resolveApiKey` read from `process.env` directly; no injection point
    exists in the startup sequence
- [ ] In `loadShellEnv()`, replace:
  ```ts
  for (const line of parts[1]!.split('\n')) { ... }
  return;
  ```
  with:
  ```ts
  if (!parseEnvBlock(parts[1]!)) continue;
  return;
  ```
  This preserves the existing fallback behavior: if the size cap fires, `loadShellEnv`
  tries the next candidate shell rather than exiting.

#### 3. `src/main/utils/env.test.ts` — `parseEnvBlock` tests

**Tasks:**
- [ ] Add a `describe('parseEnvBlock')` block. Tests use `vi.spyOn(console, 'warn')` to
      assert warning messages where specified. Tests that write to `process.env` clean up
      via `delete process.env.KEY` in `afterEach` (`vi.unstubAllEnvs` handles stubbed reads
      only; `delete` is required for written keys):

  - **Happy path**: `'KEY=value\nKEY2=value2\n'` → `process.env.KEY === 'value'` and
    `process.env.KEY2 === 'value2'`; returns `true`
  - **Empty block**: `parseEnvBlock('')` → no writes, no crash; returns `true`
  - **Key with lowercase**: `'my_key=value'` → `process.env['my_key']` is undefined;
    returns `true`
  - **Key with dot**: `'MY.KEY=value'` → not written; returns `true`
  - **Key with space**: `'MY KEY=value'` → not written; returns `true`
  - **Empty key** (line starts with `=`): `'=value'` → skipped; returns `true`
  - **No `=`**: `'NOEQUALS'` → skipped; no crash; returns `true`
  - **Value exactly at limit**: value of `ENV_VALUE_MAX_BYTES` chars → written; returns
    `true` (use the exported constant, not hardcoded `8192`)
  - **Value over limit**: value of `ENV_VALUE_MAX_BYTES + 1` chars → not written; returns
    `true` (key-skipped warning logged in dev mode)
  - **Multi-`=` value**: `'KEY=a=b=c'` → `process.env.KEY === 'a=b=c'`; returns `true`
  - **Empty value**: `'KEY='` → `process.env.KEY === ''`; returns `true`
  - **Size cap**: block of `SHELL_ENV_MAX_LEN + 1` chars → no writes; returns `false`;
    `console.warn` called with a string containing `'size cap'` (use `vi.spyOn` to assert)

### P1: Ship If Capacity Allows

- [ ] Add a warning-text assertion for the key-filter and value-filter warning messages
      (in addition to the size-cap warning assertion in P0). Use `vi.spyOn(console, 'warn')`
      to confirm the exact key name appears in the logged message.

### Deferred

- **Lowercase key names** — the seed explicitly specifies `[A-Z0-9_]+`; supporting
  lowercase keys (`nvm_dir`, `npm_config_prefix`) is a separate, explicit policy decision.
- **Production-visible error when size cap fires** — the seed specifies dev-mode-only
  warning; a future sprint could add a renderer notification for this failure mode.
- **Structured logging** — `console.warn` is consistent with `fieldEncryption.ts`; a
  unified logging system is a separate sprint concern.
- **Re-running `loadShellEnv()` after a settings change** — startup-only function; not in scope.

---

## Files Summary

| File | Action | Purpose |
|------|--------|---------|
| `src/main/utils/env.ts` | Modify | Extend comment block; export constants; export `parseEnvBlock()` (boolean return); update `loadShellEnv()` call site |
| `src/main/utils/env.test.ts` | Modify | Add `describe('parseEnvBlock')` block with 12 test cases + warning spy |

---

## Definition of Done

**Comment block:**
- [ ] Existing comment above `loadShellEnv()` is extended (not duplicated) to cover:
      `-ilc` rationale, process-space implication, acceptability argument, non-Windows reason
- [ ] Comment does not soften the security trade-off

**Constants:**
- [ ] `SHELL_ENV_MAX_LEN = 512 * 1024` exported from `env.ts`
- [ ] `ENV_VALUE_MAX_BYTES = 8 * 1024` exported from `env.ts`
- [ ] `ENV_KEY_RE = /^[A-Z0-9_]+$/` exported from `env.ts`

**`parseEnvBlock()` helper:**
- [ ] Exported from `env.ts` with signature `(block: string): boolean`
- [ ] Returns `false` with dev-mode warning if `block.length > SHELL_ENV_MAX_LEN`
- [ ] Returns `true` after processing the block (including when some entries were skipped)
- [ ] Splits on `'\n'`; skips lines where `eq <= 0`
- [ ] Skips keys not matching `ENV_KEY_RE`; logs key name in dev mode
- [ ] Skips values over `ENV_VALUE_MAX_BYTES`; logs key name in dev mode
- [ ] Splits value on first `=` only (multi-`=` values handled correctly)
- [ ] Accepts empty values (`'KEY='` → `''`)
- [ ] Dev-mode guard uses `process.env.NODE_ENV !== 'production'`

**`loadShellEnv()` wiring:**
- [ ] The `for (const line of parts[1]!.split('\n'))` loop is removed
- [ ] `if (!parseEnvBlock(parts[1]!)) continue;` replaces it
- [ ] Fallback behavior preserved: oversized block causes `continue` to next candidate shell,
      not an early `return` from `loadShellEnv`

**Tests:**
- [ ] All 12 test cases listed in P0 pass
- [ ] Size-cap test uses `vi.spyOn(console, 'warn')` and asserts warning was called
- [ ] Boundary value tests reference `SHELL_ENV_MAX_LEN` and `ENV_VALUE_MAX_BYTES` constants,
      not hardcoded magic numbers
- [ ] Write isolation: each test cleans up its specific written keys via `delete process.env[key]`
      in `afterEach`
- [ ] No subprocess spawned in any unit test
- [ ] Existing `maskApiKey`, `resolveApiKey`, `resolveApiKeyStatus` tests pass unchanged
- [ ] `make test-unit` passes

**Scope:**
- [ ] `npm run lint` passes (`tsc --noEmit`)
- [ ] No new npm dependencies
- [ ] No schema changes, no IPC changes, no renderer changes

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| `ENV_KEY_RE` drops lowercase keys a user depends on (`nvm_dir`, etc.) | Low | Medium | This is an intentional policy change per the seed; behavior is documented in Use Case 1; lowercase-key support is deferred as a separate decision |
| Size cap fires for a legitimate large environment; silent in production | Low | Medium | Fallback shell is tried before giving up; dev-mode warning names the consequence; production-visible error path is deferred per seed spec |
| `parseEnvBlock` return-`false` path not exercised in tests | Very Low | Low | Covered by the size-cap test case in P0 (DoD item) |
| Test write leakage into other tests | Low | Low | Explicit `delete process.env[key]` in `afterEach`; `vi.unstubAllEnvs` for stubs |
| `block.length` counts UTF-16 units not bytes | Very Low | Low | Named `SHELL_ENV_MAX_LEN`; commented with UTF-16 note; for ASCII env vars (universal in practice) the values are identical |

---

## Security Considerations

- **Untrusted data source**: `spawnSync` stdout from a login shell is user-controlled input.
  A malicious or corrupted `.zshrc` could export a large payload or keys with non-standard
  characters. The size cap and key-name filter reduce the blast radius of pathological
  configurations without blocking the legitimate feature.
- **Comment accuracy**: the comment explicitly acknowledges that shell init files run in
  Polyphon's process space. The acceptability argument (`.zshrc` control ≡ account ownership)
  is technically correct for a local-first desktop app and must not be softened.
- **No new attack surface**: no new IPC channels, no new subprocess paths, no schema changes.
  The shell spawn was already present; this sprint adds guards to the output processing only.
- **`process.env` pollution eliminated**: without the key-name filter, a shell exporting
  `MY.PLUGIN.VAR=value` would write a dotted key into Node's `process.env`, violating the
  implicit assumption in `resolveApiKey` and downstream code. The filter prevents this class
  of silent state corruption.
- **Defense in depth**: the size cap, key filter, and value filter are independent; each is
  testable in isolation; removing any one does not compromise the others.

---

## Observability & Rollback

**Post-ship verification:**
- `make test-unit` → `env.test.ts` passes including all new `parseEnvBlock` cases
- `npm run lint` → no type errors
- Dev-mode verification: run app; manually export a dotted env var before launch; confirm
  the `[loadShellEnv] skipping env var with non-standard name` warning appears in
  Electron DevTools console
- Note: the size-cap warning is suppressed in production builds (by design, per seed).
  The fallback-shell behavior is the production-mode defense.

**Rollback:**
Revert the `env.ts` changes (comment extension, constant exports, `parseEnvBlock` export,
loop replacement) and remove the `describe('parseEnvBlock')` block from `env.test.ts`. No
schema changes, no migrations, no IPC contract changes. Single-commit revert.

---

## Documentation

- The security comment block in `env.ts` is the documentation artifact for this sprint.
- No `CLAUDE.md` update needed — the validate-at-boundary pattern is already documented;
  this sprint is an application of it to a startup utility path.

---

## Dependencies

- No sprint dependencies
- No new npm dependencies
- Continues the validate-at-parse-boundary pattern from Sprint 005 (IPC validation) and
  Sprint 008 (CLI command hardening)

---

## Devil's Advocate and Security Critiques Addressed

| Critique | Source | Action |
|---|---|---|
| Use Case 1 claims "identically to today" — false for lowercase keys | DA | Use Case 1 updated: explicitly states lowercase keys are filtered; framed as intentional policy per seed |
| `return` after `parseEnvBlock` prevents fallback shell when size cap fires | DA | `parseEnvBlock` now returns `boolean`; `loadShellEnv` uses `continue` on `false` |
| `block.length` is not bytes; `SHELL_ENV_MAX_BYTES` is a misnomer | DA | Renamed to `SHELL_ENV_MAX_LEN`; comment added explaining UTF-16 units |
| Warning message text has no test coverage | DA | P0 size-cap test uses `vi.spyOn(console, 'warn')` to assert warning was called |
| `ENV_VALUE_MAX_BYTES` not exported; tests would hardcode magic number | DA | All three constants exported; boundary tests reference them by name |
| No DoD item verifies `loadShellEnv` → `parseEnvBlock` wiring | DA | Dedicated DoD section "loadShellEnv() wiring" with explicit checklist items |
| Silent production failure when size cap fires | DA | Acknowledged in Use Case 2 and Risks table; production-visible error deferred per seed (seed specifies dev-mode-only warning); fallback shell is now tried before giving up |
| `parseEnvBlock` should return `Record<string,string>` (pure function) | DA | **Rejected** — user confirmed "mutate process.env directly" in the interview; direct mutation matches existing function behavior; injectable target adds an API surface with no production consumer |
| Comment block correctness is unverifiable by automation | DA | **Rejected** — code review is the correct mechanism for comment correctness; this is normal across all sprint comment tasks in this repo |
| `ENV_KEY_RE` allows digit-leading names (not strictly POSIX) | DA | Acknowledged in Architecture notes; seed explicitly specifies `[A-Z0-9_]+`; digit-leading names are nonexistent in practice |
| All security findings | Security review | All Low; no DoD changes required |

---

## Open Questions

None.
