# Sprint 013: Application Logging System

## Overview

Polyphon's main process has no file-based logging. Ten `console.*` calls are scattered
across five files — some gated by `NODE_ENV !== 'production'`, some unconditional — with
no persistent output, no log levels, and no sanitization. When something goes wrong in
production, there is nothing for users to share with developers.

This sprint adds a unified logging system using `electron-log`, which is purpose-built
for Electron and handles OS-specific log path resolution (`app.getPath('logs')`)
transparently. A mandatory sanitizer sits between every caller and the file transport,
enforcing that PII and encrypted-field content never reach a log file. Debug mode is
gated behind `POLYPHON_DEBUG=1` and writes to a separate file designed to exclude
known PII and credential patterns, suitable for sharing with developers.

**Scope of the sanitizer:** The sanitizer is a safety net against accidental exposure of
known-sensitive field names and common credential patterns. It is not a guarantee that
logs are free of all conceivable sensitive content — callers are responsible for
constructing log arguments from safe fields (ids, provider names, counts, modes) rather
than raw config or row objects. The code-review DoD item below enforces this at call sites.

**Key constraints:** logs must never contain decrypted field values from the
`ENCRYPTED_FIELDS` manifest, conductor profile data (name, pronouns, context, avatar),
API keys, or bearer tokens. The sanitizer enforces this unconditionally on all output.
Logging must be non-fatal — a transport failure must never block startup or message flow.

## Use Cases

1. **Log file in the right place on every platform**: Polyphon starts; a `polyphon.log`
   appears in `~/Library/Logs/Polyphon/` (macOS), `~/.config/Polyphon/logs/` (Linux), or
   `%APPDATA%\Polyphon\logs\` (Windows). No hardcoded paths. `app.getPath('logs')` resolves
   the correct directory on all three platforms.

2. **Startup and lifecycle events are captured**: The log contains app startup with version
   and platform, window creation, and app-quit. These are the first events a developer
   looks for when a user reports a problem.

3. **Errors land in the log safely**: A voice fails to initialize; the error is logged at
   `error` level with provider name and error message. No API key. No system prompt content.
   No encrypted blobs.

4. **Debug mode for developer sharing**: User sets `POLYPHON_DEBUG=1` and restarts; a
   `polyphon-debug.log` appears alongside `polyphon.log` with verbose output (session/round
   lifecycle, IPC channel outcomes). The user can zip both files and send them safely.

5. **PII never reaches the log**: A bug accidentally passes a user profile object to the
   logger. The sanitizer replaces `conductorName`, `pronouns`, `conductorContext`,
   `conductorAvatar` values with `[REDACTED]` before writing. The key names are retained
   so the log is still structurally readable.

6. **Ciphertext is masked**: A DB row in a pre-decryption state is accidentally logged.
   The sanitizer detects the `ENC:v1:` prefix and replaces the value with `[ENCRYPTED]`.

7. **Pre-ready logging is not lost**: The logger is used before `app.whenReady()` resolves.
   `electron-log` buffers these entries and flushes to the correct log directory once
   Electron knows the path.

8. **Logger never crashes the app**: Sanitization throws on a pathological input; the
   error is swallowed; the app continues. Logging is best-effort, never blocking.

## Architecture

```
Caller (main process — never renderer)
    ↓ logger.info('Session created', { sessionId, mode })
src/main/utils/logger.ts
    ↓ sanitize(args)
        ├── Visit objects with WeakSet (true circular reference detection)
        ├── Depth limit: truncate at 6 levels → '[DEPTH LIMIT]'
        ├── Replace value for any key in SENSITIVE_LOG_KEYS → '[REDACTED]'
        ├── Replace 'ENC:v1:...' strings → '[ENCRYPTED]'
        ├── Replace API key / bearer token patterns → '[REDACTED]'
        ├── Handle Error: { name, message (sanitized) } [stack only in debug]
        ├── Handle Buffer: '[BUFFER length=N]'
        ├── Handle Map/Set: '[Map size=N]' / '[Set size=N]'
        ├── Handle Date: ISO string representation
        ├── Handle class instances (non-plain objects): '[ClassName]'
        └── Never mutate caller-owned objects (deep copy before redaction)
    ↓ log.info(sanitizedArgs)  ← electron-log
        ├── polyphon.log (always, info+ level)
        └── polyphon-debug.log (POLYPHON_DEBUG=1 only, debug+ level)
             Note: debug log is an independent transport that receives ALL
             levels ≥ debug (including info/warn/error) so it is a complete
             standalone file for developer sharing.

SENSITIVE_LOG_KEYS (built at module load from ENCRYPTED_FIELDS + explicit extras):
    From manifest (snake_case):  content, metadata, conductor_name, pronouns,
        conductor_context, conductor_avatar, base_url, system_prompt, cli_args,
        cli_command, description
    Derived (camelCase):         conductorName, conductorContext, conductorAvatar,
        baseUrl, systemPrompt, cliArgs, cliCommand
    Explicit extras:             apiKey, api_key, authorization, Authorization,
        x-api-key, x-goog-api-key

API key / bearer token patterns:
    /ENC:v1:/  → [ENCRYPTED]
    /sk-|sk-ant-|AIza|gsk_|GOOG|ghp_|github_pat_|Bearer\s/  → [REDACTED]

Log paths (via app.getPath('logs')):
    macOS:   ~/Library/Logs/Polyphon/polyphon.log
    Linux:   ~/.config/Polyphon/logs/polyphon.log
    Windows: %APPDATA%\Polyphon\logs\polyphon.log
```

## Implementation Plan

### P0: Must Ship

#### 1. Add `electron-log` dependency

**Files:** `package.json`

**Tasks:**
- [ ] Verify current latest: `npm view electron-log version` — confirm `5.4.3`
- [ ] Add `"electron-log": "^5.4.3"` to `dependencies` (runtime dep, not devDependencies)
- [ ] Run `npm install` to update `package-lock.json`
- [ ] Verify `npm run typecheck` passes (electron-log ships its own types)

#### 2. Create `src/main/utils/logger.ts`

**Files:** `src/main/utils/logger.ts` (new file)

**Tasks:**

**Build `SENSITIVE_LOG_KEYS` from the manifest:**
- [ ] Import `ENCRYPTED_FIELDS` from `../../db/encryptionManifest`
- [ ] At module load time, build the set by:
  1. Flattening all column arrays from `ENCRYPTED_FIELDS` into snake_case keys
  2. For each snake_case key, deriving the camelCase variant:
     `key.replace(/_([a-z])/g, (_, c) => c.toUpperCase())`
  3. Adding explicit extras: `apiKey`, `api_key`, `authorization`, `Authorization`,
     `x-api-key`, `x-goog-api-key`
- [ ] Export as `export const SENSITIVE_LOG_KEYS: ReadonlySet<string>`
- [ ] Export `export const ENCRYPTED_BLOB_RE = /ENC:v1:[A-Za-z0-9+/=]+/g`
- [ ] Export `export const API_KEY_RE = /sk-\S+|sk-ant-\S+|AIza\S+|gsk_\S+|GOOG\S+|ghp_\S+|github_pat_\S+|Bearer\s+\S+/g`

**Implement `sanitizeValue(value, visited?, depth?)`:**
- [ ] `visited = new WeakSet()` (passed through recursive calls for circular detection)
- [ ] `depth = 0`
- [ ] If `depth >= 6`: return `'[DEPTH LIMIT]'`
- [ ] If `value instanceof Error`: return `{ name: value.name, message: sanitizeString(value.message) }` — do NOT include stack in the standard path; stack is included only if `POLYPHON_DEBUG === '1'` and is sanitized via `sanitizeString`
- [ ] If `Buffer.isBuffer(value)`: return `\`[BUFFER length=${(value as Buffer).length}]\``
- [ ] If `value instanceof Map`: return `\`[Map size=${(value as Map<unknown,unknown>).size}]\``
- [ ] If `value instanceof Set`: return `\`[Set size=${(value as Set<unknown>).size}]\``
- [ ] If `value instanceof Date`: return `(value as Date).toISOString()`
- [ ] If `value` is a string: return `sanitizeString(value)`
- [ ] If `value` is an array: map each element through `sanitizeValue(el, visited, depth + 1)`
- [ ] If `value` is a plain object and not null (prototype is `Object.prototype` or `null`):
  - If `visited.has(value)`: return `'[Circular]'`
  - `visited.add(value)`
  - Create a new object; for each key:
    - If `SENSITIVE_LOG_KEYS.has(key)`: set `'[REDACTED]'`
    - Else: `sanitizeValue(val, visited, depth + 1)`
  - Return the new object (original is never mutated)
- [ ] If `value` is any other non-null object (class instance not handled above):
  return `` `[${(value as object).constructor?.name ?? 'Object'}]` ``
- [ ] Otherwise (number, boolean, null, undefined): return as-is
- [ ] The function must never throw — wrap in try/catch, return `'[sanitize error]'` on failure

**Implement `sanitizeString(s: string): string`:**
- [ ] Replace all `ENC:v1:` blobs: `s.replace(ENCRYPTED_BLOB_RE, '[ENCRYPTED]')`
- [ ] Replace all API key / bearer patterns: `s.replace(API_KEY_RE, '[REDACTED]')`
- [ ] Return the sanitized string

**Implement `sanitizeLogArgs(args: unknown[]): unknown[]`:**
- [ ] `args.map(a => sanitizeValue(a))`

**Configure electron-log:**
- [ ] Import `log` from `'electron-log/main'`
- [ ] Call `log.initialize()` — safe to call idempotently
- [ ] `log.transports.file.level = 'info'`; `log.transports.file.fileName = 'polyphon.log'`
- [ ] Console transport: `log.transports.console.level = process.env.NODE_ENV !== 'production' ? 'debug' : false`
- [ ] If `process.env.POLYPHON_DEBUG === '1'`, add debug file transport:
  - Verify the exact electron-log v5 API for adding a second `FileTransport` instance
    at build time; use `log.transports.file2 = ...` or `log.addTransport()` per v5 docs
  - `debugTransport.fileName = 'polyphon-debug.log'`
  - `debugTransport.level = 'debug'`

**Export the logger:**
- [ ] Export `logger` with methods that sanitize before dispatching:
  ```ts
  export const logger = {
    error: (...args: unknown[]) => { try { log.error(...sanitizeLogArgs(args)); } catch {} },
    warn:  (...args: unknown[]) => { try { log.warn(...sanitizeLogArgs(args)); } catch {} },
    info:  (...args: unknown[]) => { try { log.info(...sanitizeLogArgs(args)); } catch {} },
    debug: (...args: unknown[]) => { try { log.debug(...sanitizeLogArgs(args)); } catch {} },
  };
  ```
  The `try/catch` wrapper ensures a sanitization or transport failure never bubbles
  up to the caller — logging is non-fatal.
- [ ] Also export `sanitizeValue` and `sanitizeLogArgs` for unit testing

#### 3. Create `src/main/utils/logger.test.ts`

**Files:** `src/main/utils/logger.test.ts` (new file)

**Tasks:**
- [ ] Mock `electron-log/main` via `vi.mock('electron-log/main', () => ({ initialize: vi.fn(), transports: { file: {}, console: {} } }))` so tests don't require Electron runtime
- [ ] Test `sanitizeValue` exhaustively:

  **String sanitization:**
  - Plain string `'hello'` → `'hello'`
  - `'ENC:v1:abc123=='` → `'[ENCRYPTED]'`
  - `'sk-proj-abc'` → `'[REDACTED]'`
  - `'Bearer ghp_abc123'` → contains `'[REDACTED]'`
  - `'AIzaSyABC'` → `'[REDACTED]'`

  **PII key cases — one test per key in SENSITIVE_LOG_KEYS:**
  - `{ conductorName: 'Alice' }` → `{ conductorName: '[REDACTED]' }`
  - `{ conductor_name: 'Alice' }` → `{ conductor_name: '[REDACTED]' }`
  - `{ pronouns: 'she/her' }` → `{ pronouns: '[REDACTED]' }`
  - `{ conductorContext: 'I am...' }` → `{ conductorContext: '[REDACTED]' }`
  - `{ conductor_context: 'I am...' }` → `{ conductor_context: '[REDACTED]' }`
  - `{ conductorAvatar: 'data:...' }` → `{ conductorAvatar: '[REDACTED]' }`
  - `{ conductor_avatar: 'data:...' }` → `{ conductor_avatar: '[REDACTED]' }`
  - `{ content: 'message text' }` → `{ content: '[REDACTED]' }`
  - `{ metadata: '{}' }` → `{ metadata: '[REDACTED]' }`
  - `{ base_url: 'http://...' }` → `{ base_url: '[REDACTED]' }`
  - `{ baseUrl: 'http://...' }` → `{ baseUrl: '[REDACTED]' }`
  - `{ systemPrompt: 'You are...' }` → `{ systemPrompt: '[REDACTED]' }`
  - `{ system_prompt: 'You are...' }` → `{ system_prompt: '[REDACTED]' }`
  - `{ cliArgs: '--flag' }` → `{ cliArgs: '[REDACTED]' }`
  - `{ cli_args: '--flag' }` → `{ cli_args: '[REDACTED]' }`
  - `{ cliCommand: 'claude' }` → `{ cliCommand: '[REDACTED]' }`
  - `{ cli_command: 'claude' }` → `{ cli_command: '[REDACTED]' }`
  - `{ description: 'A tone desc' }` → `{ description: '[REDACTED]' }`
  - `{ apiKey: 'sk-...' }` → `{ apiKey: '[REDACTED]' }`
  - `{ authorization: 'Bearer ...' }` → `{ authorization: '[REDACTED]' }`

  **Safe keys (not redacted):**
  - `{ sessionId: 'abc', provider: 'anthropic', model: 'claude-3-5', role: 'voice' }` → unchanged

  **Structural cases:**
  - Nested: `{ voice: { systemPrompt: 'secret', model: 'gpt-4o' } }` →
    `{ voice: { systemPrompt: '[REDACTED]', model: 'gpt-4o' } }`
  - Array: `[{ conductorName: 'Alice' }, 'hello']` →
    `[{ conductorName: '[REDACTED]' }, 'hello']`
  - Depth limit: object nested 7 levels deep → innermost is `'[DEPTH LIMIT]'`
  - Circular: `const o = {}; (o as any).self = o;` → `{ self: '[Circular]' }` (no throw)
  - Error: `new Error('hello')` → `{ name: 'Error', message: 'hello' }` (no stack)
  - Buffer: `Buffer.from('abc')` → string matching `'[BUFFER length=3]'`

  **Non-mutation:**
  - `const o = { conductorName: 'Alice' }; sanitizeValue(o); expect(o.conductorName).toBe('Alice')`

  **SENSITIVE_LOG_KEYS coverage:**
  - `expect(SENSITIVE_LOG_KEYS.has('conductor_name')).toBe(true)` for each manifest field
  - `expect(SENSITIVE_LOG_KEYS.has('conductorName')).toBe(true)` for each camelCase variant

#### 4. Add startup/shutdown logging to `src/main/index.ts`

**Files:** `src/main/index.ts`

**Tasks:**
- [ ] Import `logger` from `'./utils/logger'` near the top of the file
- [ ] After `loadShellEnv()`, add:
  `logger.info('Polyphon starting', { version: app.getVersion(), platform: process.platform })`
- [ ] After window creation, add:
  `logger.info('Main window created')`
- [ ] Add `app.on('before-quit', () => logger.info('Polyphon shutting down'))`
- [ ] In the key-load error branch (where `loadOrCreateKey` fails or returns a warn state),
  add `logger.error('Key load error', { message: e.message })` — never log the key itself
- [ ] Wire process-level failure handlers immediately after the logger is imported:
  ```ts
  process.on('uncaughtException', (err) => {
    logger.error('Uncaught exception', err);
  });
  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled rejection', reason);
  });
  ```
  These are critical: they capture crashes that would otherwise produce no log output.

#### 5. Migrate all existing `console.*` calls

**Files:**

| File | Call | Migration |
|---|---|---|
| `src/main/utils/env.ts:31` | `console.warn([loadShellEnv] skipping env var with non-standard name)` | `logger.debug(...)` |
| `src/main/utils/env.ts:37` | `console.warn([loadShellEnv] skipping env var with oversized value)` | `logger.debug(...)` |
| `src/main/utils/env.ts:57` | `console.warn([loadShellEnv] env block exceeds size cap)` | `logger.debug(...)` |
| `src/main/utils/env.ts:75` | `console.warn([loadShellEnv] env block exceeds size cap)` | `logger.debug(...)` |
| `src/main/security/fieldEncryption.ts:46` | `console.error([security] decryptField failed)` | `logger.error(...)` |
| `src/main/utils/updateChecker.ts:66` | `console.log([updateChecker] manual check failed)` | `logger.debug(...)` |
| `src/main/utils/updateChecker.ts:99` | `console.log([updateChecker] check failed)` | `logger.debug(...)` |
| `src/main/ipc/index.ts:276` | `console.warn(shell:openExternal blocked — not in allowlist)` | `logger.warn(...)` |
| `src/main/ipc/index.ts:280` | `console.warn(shell:openExternal blocked — invalid URL)` | `logger.warn(...)` |
| `src/main/ipc/settingsHandlers.ts:259` | `console.error([probeModel] HTTP ${status} ..., body.slice(0,500))` | `logger.error(...)` — body is already sliced; sanitizer will catch any leaked keys |

**Tasks:**
- [ ] In each file listed above, add `import { logger } from '../utils/logger'` (adjust path
  for each file's location) and replace each `console.*` call with the mapped `logger.*` call
- [ ] After migration, verify: `rg -n "console\.(warn|error|log)" src/main/ --include="*.ts" | grep -v "\.test\."` returns zero hits outside `logger.ts` itself

#### 6. Add session and voice lifecycle logging

**Files:**
- `src/main/managers/SessionManager.ts`
- `src/main/managers/VoiceManager.ts`

**Tasks:**
- [ ] In `VoiceManager`: import `logger`; add `info` when a session's voices are initialized
  (`sessionId`, voice count, provider names); add `error` for unknown provider / missing
  custom provider (before the throw). Never log `systemPrompt`, `cliArgs`, `cliCommand`.
- [ ] In `SessionManager`: import `logger`; add `info` when a round starts/completes
  (`sessionId`, round index, mode, target voice count); add `warn` for SESSION_NO_TARGET
  events; add `error` for voice stream failures. Never log message content or prompt text.

#### 7. Extend `src/main/ipc/settingsHandlers.integration.test.ts` — redaction proof

**Files:** `src/main/ipc/settingsHandlers.integration.test.ts` (extend)

**Tasks:**
- [ ] Add a describe block `'logger sanitization on real code path'`
- [ ] Spy on `log.error` (the electron-log transport) in the test
- [ ] Invoke `probeModel`-style handler logic with a mocked HTTP response containing
  an API key substring (`sk-test-...`) and an encrypted blob (`ENC:v1:deadbeef`)
  in the response body
- [ ] Assert the spy was called and the captured argument string contains:
  - `'[REDACTED]'` where the API key was
  - `'[ENCRYPTED]'` where the encrypted blob was
  - The raw `sk-test-...` value does NOT appear in any logged string
- [ ] This is the end-to-end proof that sanitization holds through a real application path,
  not just in isolation

#### 8. Update `CLAUDE.md`

**Files:** `CLAUDE.md`

**Tasks:**
- [ ] Add to the Coding Conventions section:
  ```
  ### Logging
  Use `logger` from `src/main/utils/logger.ts` for all diagnostic output in the main
  process. Never use `console.warn`, `console.error`, or `console.log` directly in
  `src/main/`. All logger output is sanitized before writing to disk — no PII or
  encrypted-field content ever reaches a log file.
  ```

### P1: Ship If Capacity Allows

- [ ] **IPC `handleLogged()` wrapper** — add a thin wrapper around `ipcMain.handle` that
  catches uncaught handler errors, logs them at `error` level with the channel name and
  sanitized error message, then rethrows. Apply to high-risk handlers: `VOICE_SEND`,
  `SESSION_CREATE`, `SETTINGS_SAVE_USER_PROFILE`. Log only channel name + sanitized
  error; never log handler arguments.
- [ ] **Error stack in debug mode** — when `POLYPHON_DEBUG=1`, include the sanitized
  stack in the Error representation (run the full stack string through `sanitizeString`
  before including it)

### Deferred

- **Renderer-side file logging** — renderer is sandboxed; any renderer log would need
  to cross IPC. Separate sprint.
- **User-facing "export debug log" UI** — product decision; out of scope.
- **Structured JSON log output** — human-readable format is sufficient for V1.
- **Log rotation explicit config** — electron-log's defaults (10MB max, 3 files) are
  acceptable; add explicit config only if users report issues.
- **Blanket IPC payload logging** — intentionally rejected; channel names + outcomes only.

---

## Files Summary

| File | Action | Purpose |
|------|--------|---------|
| `package.json` | Modify | Add `electron-log ^5.4.3` to dependencies |
| `package-lock.json` | Modify | Lock the new dependency |
| `src/main/utils/logger.ts` | Create | Sanitized logger module |
| `src/main/utils/logger.test.ts` | Create | Sanitizer unit tests (exhaustive) |
| `src/main/index.ts` | Modify | Import logger; add startup/shutdown entries |
| `src/main/utils/env.ts` | Modify | Replace 4 `console.warn` with `logger.debug` |
| `src/main/security/fieldEncryption.ts` | Modify | Replace `console.error` with `logger.error` |
| `src/main/utils/updateChecker.ts` | Modify | Replace 2 `console.log` with `logger.debug` |
| `src/main/ipc/index.ts` | Modify | Replace 2 `console.warn` with `logger.warn` |
| `src/main/ipc/settingsHandlers.ts` | Modify | Replace `console.error` with `logger.error` |
| `src/main/managers/SessionManager.ts` | Modify | Add round/stream lifecycle logs |
| `src/main/managers/VoiceManager.ts` | Modify | Add session/voice lifecycle logs |
| `src/main/ipc/settingsHandlers.integration.test.ts` | Extend | Integration test for sanitization |
| `CLAUDE.md` | Modify | Document `logger` as required channel |

---

## Definition of Done

**Logger module:**
- [ ] `src/main/utils/logger.ts` exports `logger.error`, `logger.warn`, `logger.info`, `logger.debug`
- [ ] All methods sanitize args via `sanitizeLogArgs` before dispatching to electron-log
- [ ] All methods are wrapped in try/catch — logger failures are non-fatal
- [ ] `SENSITIVE_LOG_KEYS` exported as `ReadonlySet<string>` containing all manifest fields
  (both snake_case and camelCase), plus explicit extras
- [ ] `ENCRYPTED_BLOB_RE` and `API_KEY_RE` exported
- [ ] `sanitizeValue` and `sanitizeLogArgs` exported for unit testing

**Sanitizer correctness:**
- [ ] All column names in `ENCRYPTED_FIELDS` are covered in `SENSITIVE_LOG_KEYS` (snake_case)
- [ ] All camelCase derivatives are covered
- [ ] `description` key is included (conservative per interview)
- [ ] `ENC:v1:` blobs → `[ENCRYPTED]`
- [ ] API key / bearer patterns → `[REDACTED]`
- [ ] Circular references → `[Circular]` (WeakSet-based, not depth-only)
- [ ] Depth limit: objects beyond 6 levels → `[DEPTH LIMIT]`
- [ ] `Error` instances → `{ name, message }` (no stack in default mode)
- [ ] `Buffer` → `[BUFFER length=N]`
- [ ] Caller objects are never mutated
- [ ] Sanitizer never throws

**File transport:**
- [ ] `polyphon.log` written to `app.getPath('logs')` at info+ level
- [ ] `polyphon-debug.log` written only when `POLYPHON_DEBUG=1` at debug+ level
- [ ] No hardcoded OS paths anywhere in the implementation
- [ ] Pre-app-ready log calls are not lost

**Call-site migration:**
- [ ] All 10 existing `console.*` calls in `src/main/` migrated to `logger.*`
- [ ] `rg -n "console\.(warn|error|log)" src/main/ --include="*.ts" | grep -v "\.test\."` returns zero hits outside `logger.ts` itself

**Session/voice logging:**
- [ ] Session init/dispose logged with `sessionId`, voice count, provider names only
- [ ] Round start/complete logged with `sessionId`, round index, mode only
- [ ] Voice/stream errors logged at `error` level
- [ ] No message content, system prompts, conductor profile, or IPC argument payloads logged

**Process-level failure logging:**
- [ ] `process.on('uncaughtException')` wired to `logger.error`
- [ ] `process.on('unhandledRejection')` wired to `logger.error`

**Cross-platform verification (manual — required before marking sprint complete):**
- [ ] Start the app on macOS; confirm `~/Library/Logs/Polyphon/polyphon.log` exists with startup entry
- [ ] Confirm log does not contain `ENC:v1:` or raw conductor name
- [ ] Set `POLYPHON_DEBUG=1`; confirm `polyphon-debug.log` appears in same directory

**Call-site security:**
- [ ] Every new `logger.*` call added in this sprint is reviewed to confirm arguments are
  constructed from safe fields only (ids, counts, provider names, modes) — not from raw
  row objects, full config objects, or arbitrary IPC payloads. Verified by code review.

**`probeModel` body:** (from security review)
- [ ] `settingsHandlers.ts:259` migrated to log only `{ provider, status }` — the response
  body is dropped entirely from the log call

**Tests:**
- [ ] Every key in `SENSITIVE_LOG_KEYS` has an individual unit test case
- [ ] All structural cases pass: nested, array, circular, depth limit, Error, Buffer
- [ ] Non-mutation test passes
- [ ] Integration test in `settingsHandlers.integration.test.ts` proves sanitization on a
  real code path — raw API key and ciphertext do not appear in the log sink
- [ ] `make test-unit` passes
- [ ] `make test-integration` passes

**Documentation:**
- [ ] `CLAUDE.md` updated with logging convention

**Scope:**
- [ ] `npm run typecheck` passes
- [ ] No renderer changes
- [ ] No schema changes
- [ ] No new IPC channels

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| `SENSITIVE_LOG_KEYS` misses a camelCase variant from the manifest | Low | High | Built programmatically at module load time, not hardcoded; individual test per key |
| `electron-log` v5 API for second `FileTransport` differs from expectations | Medium | Medium | Verify at build time against v5 docs; fallback: log.addTransport() |
| Logger import before `app.whenReady()` loses entries | Low | Low | electron-log buffers pre-ready entries by design |
| `probeModel` body still leaks after sanitization if body is an unusual format | Low | Medium | Body is already sliced to 500 chars; sanitizer covers known patterns; conservative |
| `description` over-redacts non-PII debug fields | Low | Low | Acceptable conservative tradeoff; documented as intentional |
| Bearer token regex misses new provider format | Medium | Medium | DoD verified by test; regex is a safety net; callers should not log raw tokens |

---

## Security Considerations

- **Sanitizer is a safety net, not a guarantee**: it catches known-sensitive key names and
  common credential patterns. Callers are the primary control — log arguments must be
  constructed from safe fields (ids, counts, provider names, modes), not raw config or row
  objects. The code-review DoD item enforces this at every new call site added in this sprint.
- **Logs are readable by the current user**: they live in user-owned directories. On macOS,
  `~/Library/Logs/Polyphon/` may be world-readable (mode 755). The sanitizer ensures no
  PII or credentials land in the log, making world-readability acceptable.
- **Debug log for developer sharing**: verbose output, still sanitized identically. Designed
  to exclude known PII and credential patterns — not a guarantee against all conceivable
  sensitive content (e.g., a new provider's unusual error format could contain data that
  doesn't match any current pattern). Users share it understanding it's best-effort.
- **`probeModel` response body dropped**: the current `console.error` logs up to 500 chars
  of the HTTP response body. In this sprint, that is replaced with status code + provider
  name only — provider response bodies are not logged.
- **API key / bearer token detection is pattern-based**: covers `sk-`, `AIza`, `ghp_`,
  `github_pat_`, `Bearer`. New token formats from new providers must be added to `API_KEY_RE`.
- **No new attack surface**: the logger is write-only; no code reads log files back;
  no new IPC channels; no schema changes.
- **Non-fatal design**: transport failures and sanitization errors are swallowed; logging
  never blocks application flow. Silent loss of log entries is the cost when the logger fails.

---

## Observability & Rollback

**Post-ship verification:**
1. Start the app; confirm log file in correct OS path
2. Check log contains startup entry with version and platform
3. Set `POLYPHON_DEBUG=1`; restart; confirm `polyphon-debug.log` appears
4. `rg "ENC:v1:" <log-path>` → zero hits
5. `rg "conductor_name|conductorName|pronouns" <log-path>` → values are `[REDACTED]`
6. `rg "console\.(warn|error|log)" src/main --include="*.ts" | grep -v "\.test\."` → zero hits
7. `make test-unit` and `make test-integration` pass

**Rollback:**
Remove `logger.ts` and `logger.test.ts`; revert all `console.*` migration changes in
`env.ts`, `fieldEncryption.ts`, `updateChecker.ts`, `ipc/index.ts`, `settingsHandlers.ts`,
`index.ts`, `SessionManager.ts`, `VoiceManager.ts`; remove integration test additions;
revert `CLAUDE.md`; remove `electron-log` from `package.json` and run `npm install`.
No schema changes, no migrations, no IPC changes — full revert in one commit.

---

## Documentation

- [ ] `CLAUDE.md` updated with logging convention (Task 8)
- [ ] No schema changes; no IPC changes; no renderer changes

---

## Dependencies

- `electron-log ^5.4.3` (new runtime dependency — confirmed latest at planning time)
- No sprint dependencies
- Implements what Sprint 010 explicitly deferred: "Structured logging — a unified logging
  system is a separate sprint concern."

---

## Devil's Advocate and Security Critiques Addressed

| Critique | Source | Action |
|---|---|---|
| "Safe to share" overconfident — regex can't cover all sensitive content | DA | **Accepted** — language changed to "designed to exclude known PII and credential patterns"; explicit callout that sanitizer is best-effort safety net, callers are primary control |
| Uncaught exceptions/unhandled rejections not wired | DA | **Accepted** — Task 4 now wires `process.on('uncaughtException')` and `process.on('unhandledRejection')` to logger.error |
| Debug log topology (does it duplicate entries?) not specified | DA | **Accepted** — Architecture section now states debug log is an independent transport receiving all levels ≥ debug |
| Non-POJO types (Map, Set, Date, class instances) unspecified | DA | **Accepted** — Architecture section now specifies handling for each type |
| Pre-ready logging not tested (only asserted) | DA | **Accepted** — Manual cross-platform verification in DoD now includes confirming startup entry was captured |
| `probeModel` body could contain provider-specific token formats | Security | **Accepted** — Task 5 now drops response body; logs only `{ provider, status }` |
| Log files may be world-readable on macOS | Security | **Accepted** — Security Considerations now notes this and explains sanitizer as the control |
| Code review requirement for new call sites | Security | **Accepted** — DoD now has explicit code-review item for every new logger call site |
| "Sanitizer tries to do too many jobs" | DA | **Rejected** — Recursive tree walker with a denylist is a common, proven pattern; not over-engineered |
| "Depth=6 is arbitrary" | DA | **Rejected** — All depth limits are; 6 is appropriate for this app's data structures |
| "More integration tests needed" | DA | **Rejected** — Exhaustive unit tests + one real-path integration test is appropriate for V1 |
| "Human-readable format makes sanitizer harder to audit" | DA | **Rejected** — Structured JSON deferred per interview; sanitizer works identically regardless of format |
| "Performance guardrail needed" | DA | **Rejected** — Logging is on non-hot paths (startup, errors, session events); not needed for V1 |
| "Design should distrust arbitrary payload logging at the type level" | DA | **Rejected** — Logger accepts `unknown[]` intentionally; code-review DoD is the call-site control |

## Open Questions

None. All design decisions resolved during planning (approaches, interview, critique, merge).
