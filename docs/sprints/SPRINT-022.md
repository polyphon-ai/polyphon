# Sprint 022: TCP API Server + poly CLI

## Overview

Sprint 021 made Polyphon callable by external agents via stdio MCP. This sprint adds a complementary control plane for humans and scripts: a JSON-RPC-over-TCP server exposing full headless control of a running instance, and a companion CLI tool (`poly`) that communicates with it.

The TCP server binds to `127.0.0.1:7432` by default, authenticates each connection via a 32-byte cryptographic token stored in `{userData}/api.key`, and exposes ~20 methods covering compositions, sessions, voice broadcast/ask (with token streaming), search, settings, MCP status, and API status. A Settings toggle enables the server; a "Remote Access" sub-toggle switches the binding to `0.0.0.0` with an explicit TLS warning. The two control planes — MCP stdio and TCP API — remain architecturally separate: same headless execution layer, different transports.

`poly` is a standalone Node.js CLI in a new `packages/poly/` npm workspace, published as `@polyphon-ai/poly`. It has no Electron dependency. For local use it reads `api.key` automatically from the platform-correct Polyphon `userData` directory. For remote use it reads `POLYPHON_HOST`, `POLYPHON_PORT`, `POLYPHON_TOKEN` env vars or named remotes stored in `~/.config/poly/remotes.json`.

## Use Cases

1. **Script a multi-voice broadcast**: `poly run --composition abc123 --prompt "Summarize this PR" --stream` — streams all voice tokens to the terminal in real time.
2. **Export a session transcript without opening the GUI**: `poly sessions export <id> --format markdown > transcript.md`
3. **Check Polyphon health from CI**: `poly status` returns app version, API port, MCP status, and provider statuses.
4. **Remote control from another machine on a trusted network**: `POLYPHON_HOST=laptop.local POLYPHON_PORT=7432 POLYPHON_TOKEN=$(cat token.txt) poly compositions list`
5. **Pipe composition list to jq**: `poly compositions list --format json | jq '.[].name'`

## Architecture

```
Polyphon main process
├── src/main/api/
│   ├── index.ts             createApiController factory (mirrors mcp/index.ts)
│   ├── server.ts            ApiServerController: net.Server, NDJSON, auth, restart
│   ├── auth.ts              loadOrCreateApiToken, rotateApiToken, getLocalTokenPath
│   ├── dispatcher.ts        JSON-RPC dispatch table + error codes
│   └── handlers/
│       ├── api.ts           api.authenticate, api.getStatus
│       ├── compositions.ts  compositions.list / .get / .create / .update / .delete / .archive
│       ├── sessions.ts      sessions.list / .get / .create / .delete / .rename / .archive
│       │                    sessions.export / sessions.messages
│       ├── voice.ts         voice.broadcast (streaming) / voice.ask (streaming) / voice.abort
│       ├── search.ts        search.messages
│       ├── settings.ts      settings.getProviderStatus / settings.getDebugInfo
│       └── mcp.ts           mcp.getStatus / mcp.setEnabled
└── src/main/index.ts        wire ApiServerController alongside McpServerController

packages/poly/
├── src/
│   ├── index.ts             commander entry point, shebang
│   ├── client.ts            TCP client: connect, authenticate, send, handle stream.chunk
│   ├── connect.ts           resolve host/port/token (local file / env vars / named remotes)
│   ├── remotes.ts           ~/.config/poly/remotes.json CRUD
│   ├── format.ts            human-readable + JSON formatters
│   └── commands/
│       ├── compositions.ts
│       ├── sessions.ts
│       ├── run.ts           poly run (broadcast)
│       ├── ask.ts
│       ├── search.ts
│       ├── status.ts
│       └── remote.ts        poly remote add/list/remove (P1)
├── package.json             bin: { poly: "./dist/index.js" }
├── build.mjs                esbuild → dist/index.js (shebang injected)
└── tsconfig.json
```

### TCP Wire Protocol

Newline-delimited JSON-RPC 2.0 over TCP. Each object is one UTF-8 JSON line. Lines exceeding 1 MB are rejected with error `-32700` (parse error) to prevent unbounded memory buffering.

**Authentication handshake (first call on every connection):**
```json
→ {"jsonrpc":"2.0","id":1,"method":"api.authenticate","params":{"token":"<hex>"}}
← {"jsonrpc":"2.0","id":1,"result":{"ok":true}}
```
If the token is wrong the server returns error `-32001` and closes the socket. Any non-`api.authenticate` method sent before authentication succeeds also receives error `-32001` and the connection is closed. No other method is dispatched before `api.authenticate` succeeds.

**Standard request/response:**
```json
→ {"jsonrpc":"2.0","id":2,"method":"compositions.list","params":{}}
← {"jsonrpc":"2.0","id":2,"result":[...]}
```

**Streaming (voice.broadcast / voice.ask with `stream: true`):**
```json
→ {"jsonrpc":"2.0","id":3,"method":"voice.broadcast","params":{"sessionId":"...","content":"...","stream":true}}
← {"jsonrpc":"2.0","method":"stream.chunk","params":{"requestId":3,"voiceId":"v1","voiceName":"Claude","delta":"Hello"}}
← {"jsonrpc":"2.0","method":"stream.chunk","params":{"requestId":3,"voiceId":"v1","voiceName":"Claude","delta":" world"}}
← {"jsonrpc":"2.0","id":3,"result":{"messages":[...]}}
```

**Error codes:**

| Code | Meaning |
|------|---------|
| `-32700` | Parse error — invalid JSON |
| `-32600` | Invalid request |
| `-32601` | Method not found |
| `-32602` | Invalid params |
| `-32603` | Internal error |
| `-32001` | Unauthorized (bad or missing token) |
| `-32002` | Not found (session/composition doesn't exist) |
| `-32003` | Port conflict / server not running |

### ApiStatus Type

```typescript
interface ApiStatus {
  enabled: boolean;           // persisted: app_settings.api_enabled
  remoteAccessEnabled: boolean; // persisted: app_settings.api_remote_access_enabled
  running: boolean;           // currently listening?
  port: number;               // configured port
  host: string;               // '127.0.0.1' or '0.0.0.0'
  tokenFingerprint: string;   // last 8 hex chars of token — never the full token
  version: string;            // app version string — for poly compatibility checks
  startupError?: string;      // set when server failed to start (e.g. EADDRINUSE)
}
```

### voice.abort Semantics

`voice.abort` cancels the in-flight round for a given session. Abort is scoped by session ID, not by connection — any authenticated client can abort any session's in-flight round. The round's partial results (any already-completed voice turns) are saved to the DB. `stream.chunk` notifications for the aborted request stop; the final result response is sent with whatever messages completed before the abort. If no round is in progress for the given session, abort is a no-op (not an error).

### poly Connection Resolution

```
1. If --remote <name>: read ~/.config/poly/remotes.json → {host, port, tokenFile}
2. If POLYPHON_HOST set: use POLYPHON_HOST + POLYPHON_PORT (default 7432)
   Token: POLYPHON_TOKEN env var, or POLYPHON_TOKEN_FILE path
3. Default: 127.0.0.1:7432, token from platform-specific userData/api.key
   macOS:   ~/Library/Application Support/Polyphon/api.key
   Linux:   ~/.config/Polyphon/api.key
   Windows: %APPDATA%\Polyphon\api.key
   Override: POLYPHON_DATA_DIR env var for non-standard installs
```

## Implementation Plan

### P0: Must Ship

**Files (shared):**
- `src/shared/api.ts` — JSON-RPC envelope types + all method request/response shapes (importable by `poly`)
- `src/shared/types.ts` — Add `ApiStatus`
- `src/shared/constants.ts` — Add `API_GET_STATUS`, `API_SET_ENABLED`, `API_SET_REMOTE_ACCESS`, `API_ROTATE_TOKEN`, `API_STATUS_CHANGED`; add `APP_SETTING_KEYS.API_ENABLED`, `APP_SETTING_KEYS.API_REMOTE_ACCESS_ENABLED`

**Files (DB):**
- `src/main/db/migrations/014_seed_api_settings.ts` — `INSERT OR IGNORE` for `api_enabled='false'` and `api_remote_access_enabled='false'`
- `src/main/db/migrations/index.ts` — register migration 014, bump `SCHEMA_VERSION` to 14
- `src/main/db/schema.ts` — update `SCHEMA_VERSION` constant + `CREATE_TABLES_SQL` comment

**Files (API server):**
- `src/main/api/auth.ts` — `loadOrCreateApiToken()`, `rotateApiToken()`, `getLocalTokenPath()`
- `src/main/api/server.ts` — `ApiServerController`: `start()`, `stop()`, `restart()`, `rotateToken()`, `getStatus()`
- `src/main/api/dispatcher.ts` — dispatch table, JSON-RPC error code constants, streaming callback type
- `src/main/api/handlers/api.ts` — `api.authenticate`, `api.getStatus`
- `src/main/api/handlers/compositions.ts` — 6 methods
- `src/main/api/handlers/sessions.ts` — 8 methods (including `sessions.export`)
- `src/main/api/handlers/voice.ts` — broadcast (streaming), ask (streaming), abort
- `src/main/api/handlers/search.ts` — `search.messages`
- `src/main/api/handlers/settings.ts` — `settings.getProviderStatus`, `settings.getDebugInfo`
- `src/main/api/handlers/mcp.ts` — `mcp.getStatus`, `mcp.setEnabled`
- `src/main/api/index.ts` — factory (mirrors `mcp/index.ts`)

**Files (main process wiring):**
- `src/main/ipc/apiHandlers.ts` — IPC handlers: getStatus, setEnabled, setRemoteAccess, rotateToken
- `src/main/ipc/index.ts` — register API IPC handlers
- `src/main/preload.ts` — expose `window.polyphon.api.{getStatus, setEnabled, setRemoteAccess, rotateToken, onStatusChanged}`
- `src/main/index.ts` — wire `createApiController`; handle `--api-server` flag (ephemeral: starts server without mutating `api_enabled`)

**Files (Settings UI):**
- `src/renderer/components/Settings/ApiSection.tsx` — toggle, status badge, port display, remote access toggle + TLS warning, rotate token button (never renders token)
- `src/renderer/components/Settings/SettingsPage.tsx` — add ApiSection
- `src/renderer/components/Settings/ApiSection.test.tsx` — component test

**Files (poly):**
- `package.json` — add `"workspaces": ["packages/*"]`
- `packages/poly/package.json` — `@polyphon-ai/poly`, `bin: {poly: ...}`, no Electron dep
- `packages/poly/tsconfig.json`
- `packages/poly/build.mjs` — esbuild; inject `#!/usr/bin/env node` shebang
- `packages/poly/src/index.ts` — commander entry point
- `packages/poly/src/client.ts` — TCP client, auth handshake, streaming support
- `packages/poly/src/connect.ts` — token resolution: local file, env vars, named remotes; `POLYPHON_DATA_DIR` override
- `packages/poly/src/remotes.ts` — `~/.config/poly/remotes.json` CRUD
- `packages/poly/src/format.ts` — human-readable + `--format json` formatters
- `packages/poly/src/commands/compositions.ts`
- `packages/poly/src/commands/sessions.ts`
- `packages/poly/src/commands/run.ts` — `poly run` (broadcast)
- `packages/poly/src/commands/ask.ts`
- `packages/poly/src/commands/search.ts`
- `packages/poly/src/commands/status.ts`

**Tests:**
- `src/main/api/auth.test.ts` — generate, load, rotate, malformed file, `0o600` mode
- `src/main/api/server.test.ts` — framing, auth rejection, parse errors, method dispatch
- `src/main/api/handlers/compositions.test.ts`
- `src/main/api/handlers/sessions.test.ts`
- `src/main/api/handlers/voice.test.ts` — streaming, abort
- `src/main/api/handlers/search.test.ts`
- `src/main/api/handlers/mcp.test.ts`
- `packages/poly/src/client.test.ts`
- `packages/poly/src/connect.test.ts` — platform path resolution, env var override

**P0 Tasks:**
- [ ] **First task — Workspace validation gate**: convert root `package.json` to npm workspace (`"workspaces": ["packages/*"]`), create `packages/poly/` stub, confirm `npm install`, `electron-rebuild`, and `electron-forge package` all succeed before proceeding; must pass CI
- [ ] TCP framing spike: validate newline framing, partial chunk handling (coalesced frames, split UTF-8 boundaries), concurrent stream interleave, and streaming notification ordering in Electron main process; must use real `net.Server` in tests
- [ ] Define all JSON-RPC types and error code constants in `src/shared/api.ts`; duplicate API types (interfaces only) into `packages/poly/src/types.ts` — poly does not import from `src/`
- [ ] Implement `auth.ts`: `loadOrCreateApiToken`, `rotateApiToken` (atomic write: temp file + rename), `0o600` file mode, `tokenFingerprint` helper
- [ ] Implement `ApiServerController` in `server.ts`: `net.Server`, NDJSON framing with 1 MB line cap, per-connection auth via `api.authenticate`, reject pre-auth methods with `-32001` and close, hard-disconnect on auth failure, hard-disconnect all clients on `rotateToken()`, `restart()` for binding address changes (hard-disconnects all active clients before rebinding), `EADDRINUSE` handling; expose `startupError` field on `ApiStatus`
- [ ] Implement `dispatcher.ts` with JSON-RPC error codes and streaming callback interface
- [ ] Implement all handler files (api, compositions, sessions [including export], voice [streaming], search, settings, mcp); reuse `src/main/ipc/validate.ts` for input validation
- [ ] Add migration 014 and bump `SCHEMA_VERSION` to 14
- [ ] Add `API_REMOTE_ACCESS_ENABLED` to `app_settings` keys; update `ApiServerController.restart()` to re-bind on toggle
- [ ] Add API IPC handlers in `apiHandlers.ts` and register in `ipc/index.ts`
- [ ] Expose `window.polyphon.api.*` in `src/main/preload.ts`
- [ ] Wire `createApiController` in `main/index.ts` alongside MCP; add `--api-server` ephemeral flag
- [ ] Implement `ApiSection.tsx`: toggle, running/stopped badge with port, remote access toggle + TLS warning, rotate token with confirmation (never render token text); subscribe to `API_STATUS_CHANGED`
- [ ] Set up `packages/poly/` workspace; verify clean install doesn't break Electron build
- [ ] Implement `poly` TCP client with auth handshake and streaming (`stream.chunk` → incremental output)
- [ ] Implement `poly` connection resolution: local `api.key`, `POLYPHON_DATA_DIR`, env vars, named remotes
- [ ] Implement all `poly` commands: `compositions`, `sessions`, `run`, `ask`, `search`, `status`; `--stream` + `--format json` for all
- [ ] Write unit tests: tokenManager (generate, load, rotate, malformed file, `0o600` on POSIX), server (framing, auth rejection, pre-auth method rejection, parse error, 1 MB line reject), handlers (per domain)
- [ ] Write integration test with real `net.Server` + real in-memory DB covering: one method per domain, streaming (broadcast + ask), abort, restart/rebind with live clients, client disconnect mid-stream, concurrent requests on one socket
- [ ] Write security negative-test matrix: pre-auth method call rejected, wrong token rejected, token not present in logger output after failed auth, token not present in JSON-RPC error responses, `rotateToken` during active stream terminates connections
- [ ] Write IPC/TCP parity tests: compare handler outputs for representative read (`compositions.list`, `sessions.get`) and write (`sessions.create`, `sessions.rename`) methods against equivalent IPC handler behavior
- [ ] Write `poly` tests: client auth handshake, streaming chunk handling, connect resolution (platform path, env vars), exit codes (0 on success, non-zero on auth failure/connection error), `--format json` output on success AND on error
- [ ] Write `docs/api.md` and `docs/poly.md`
- [ ] Update `docs/_index.md` navigation

### P1: Ship If Capacity Allows

- [ ] `poly remote add/list/remove` — named remote management CLI; persist to `~/.config/poly/remotes.json`
- [ ] `poly login --host ... --token-file ...` — interactive auth test + save named remote
- [ ] `api.version` field in `ApiStatus` for support/debugging
- [ ] `poly remote add/list/remove` — named remote management CLI; persist to `~/.config/poly/remotes.json`
- [ ] `poly` shell completion (`poly completion bash/zsh/fish`)
- [ ] `poly sessions history --voice <name> --limit <n>` voice filter

### Deferred

- TLS termination inside Polyphon — defer to nginx/Caddy as documented
- HTTP/SSE/WebSocket/gRPC transports
- Per-method authorization scopes beyond all-or-nothing token auth
- Multiple concurrent API tokens
- Background job IDs for long-running rounds
- Subscription-style notifications beyond streaming token chunks

## Files Summary

| File | Action | Purpose |
|------|--------|---------|
| `src/shared/api.ts` | Create | JSON-RPC types + all method shapes (shared with poly) |
| `src/shared/types.ts` | Modify | Add `ApiStatus` |
| `src/shared/constants.ts` | Modify | Add API IPC constants + setting keys |
| `src/main/api/auth.ts` | Create | Token lifecycle |
| `src/main/api/server.ts` | Create | `ApiServerController` |
| `src/main/api/dispatcher.ts` | Create | Dispatch table + error codes |
| `src/main/api/handlers/*.ts` | Create (7 files) | One per domain |
| `src/main/api/index.ts` | Create | Factory function |
| `src/main/db/migrations/014_seed_api_settings.ts` | Create | Seed `api_enabled` and `api_remote_access_enabled` |
| `src/main/db/migrations/index.ts` | Modify | Register migration 014 |
| `src/main/db/schema.ts` | Modify | Bump `SCHEMA_VERSION` to 14 |
| `src/main/ipc/apiHandlers.ts` | Create | API IPC handlers |
| `src/main/ipc/index.ts` | Modify | Register API handlers |
| `src/main/preload.ts` | Modify | Expose `window.polyphon.api.*` |
| `src/main/index.ts` | Modify | Wire API server + `--api-server` flag |
| `src/renderer/components/Settings/ApiSection.tsx` | Create | Settings UI for TCP API |
| `src/renderer/components/Settings/ApiSection.test.tsx` | Create | Component test |
| `src/renderer/components/Settings/SettingsPage.tsx` | Modify | Add ApiSection |
| `packages/poly/**` | Create (~14 files) | Standalone CLI package |
| `package.json` | Modify | Add workspaces field |
| `docs/api.md` | Create | TCP API reference |
| `docs/poly.md` | Create | poly CLI reference |
| `docs/_index.md` (nav) | Modify | Link new docs |

## Definition of Done

**Server behavior:**
- [ ] `api_enabled=true` starts the TCP server on `127.0.0.1:7432`; `ApiStatus.running = true`
- [ ] All ~20 JSON-RPC methods return correct, schema-conformant results validated against a real in-memory DB in integration tests (not only via direct handler invocation)
- [ ] `voice.broadcast` and `voice.ask` with `stream: true` emit `stream.chunk` notifications with `requestId` correlation before the final result; confirmed in an integration test with a real TCP socket
- [ ] Any method sent before `api.authenticate` returns error `-32001` and the connection is closed — confirmed in test
- [ ] `api.authenticate` with a wrong token returns error `-32001` and the socket is closed — confirmed in test
- [ ] Lines exceeding 1 MB are rejected with `-32700` and the connection is closed — confirmed in test
- [ ] `EADDRINUSE` sets `ApiStatus.running = false` and `ApiStatus.startupError` with a readable message; confirmed in test
- [ ] `ApiServerController.restart()` hard-disconnects all active clients before rebinding; confirmed with live-client test
- [ ] Concurrent requests on one socket work correctly (correct `requestId` correlation, no frame corruption) — confirmed in integration test

**Security:**
- [ ] `api.key` is written with mode `0o600` on POSIX (mode assertion skipped on Windows) — confirmed in `auth.test.ts`
- [ ] Token rotation (a) writes new token atomically (temp + rename), (b) hard-disconnects all active connections — confirmed in test
- [ ] Token value does not appear in any logger output, JSON-RPC error response, or exception message — confirmed in security test matrix
- [ ] `ApiSection.tsx` TLS warning is shown whenever `remoteAccessEnabled = true` (not only during toggle interaction)

**poly CLI:**
- [ ] `poly` connects locally without configuration; `poly status` succeeds when server is running
- [ ] `poly run --stream` prints tokens as they arrive and exits 0 when complete
- [ ] `poly --format json` returns valid, parseable JSON on success; returns valid JSON error shape (not prose) on failure; exits non-zero on auth failure or connection error
- [ ] `POLYPHON_HOST`, `POLYPHON_PORT`, `POLYPHON_TOKEN` env vars configure remote connection
- [ ] `POLYPHON_DATA_DIR` overrides the local `api.key` discovery path
- [ ] `poly` error output does not contain the token value — confirmed in test

**Infrastructure:**
- [ ] `packages/poly/` npm workspace: `npm install`, `electron-rebuild`, and `electron-forge package` all succeed — confirmed in CI
- [ ] `SCHEMA_VERSION` bumped to 14; migration 014 is idempotent (`INSERT OR IGNORE`)
- [ ] Integration test suite with real `net.Server` + real in-memory DB passes in CI
- [ ] IPC/TCP parity tests pass for representative read and write methods

**Documentation:**
- [ ] `docs/api.md` and `docs/poly.md` complete and linked from navigation
- [ ] `docs/api.md` includes JSON-RPC error code table, TLS guidance with nginx/Caddy config example
- [ ] `ApiSection.tsx` shows running/stopped status, port, token fingerprint, and remote-access warning

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| TCP framing bug under partial packet delivery | Medium | High | Implement framing spike first; test with slow/chunked writes |
| `EADDRINUSE` when port 7432 already taken | Low | Medium | Surface clearly in UI/logs; `POLYPHON_API_PORT` env var override |
| npm workspace conversion breaks Electron packaging | Medium | High | Test clean install + `electron-forge package` before merging |
| `0o600` is a no-op on Windows | Medium | Low | Document limitation; `%APPDATA%` is already user-scoped |
| Concurrent streaming requests on one socket | Low | Medium | Validate with multi-request stress test during framing spike |
| poly `userData` path wrong on non-standard installs | Medium | Medium | `POLYPHON_DATA_DIR` env var escape hatch + clear error message |
| Migration 014 runs on pre-013 DB | Very Low | High | Migrations run in order; 013 creates the table; this is safe |
| Drift between IPC and TCP handler semantics | Medium | Medium | Handlers must be thin wrappers; review in DoD gate |

## Security Considerations

- Token: 32 bytes of `crypto.randomBytes()` hex — not derived from user data, not in DB, not in logs, not in CLI args
- `api.key` written with `0o600`; token fingerprint (last 8 hex chars) safe for display and logging
- Per-connection auth: `api.authenticate` must succeed before any other method is dispatched
- Token rotation: hard-disconnect all active clients immediately; regenerate token file atomically
- Remote binding: explicit user action + TLS warning in UI + documentation; default is localhost-only
- Renderer CSP unchanged: `connect-src 'none'` — renderer never touches the TCP server directly
- No eval, no dynamic `require`, no user-controlled code execution in the server path
- Handler input validated via `src/main/ipc/validate.ts` before touching DB or voice system

## Observability & Rollback

- **Verification post-ship**: `poly status` → `running: true`. `poly compositions list` against a dev instance. Full streaming test via `poly run --stream`.
- **Logs**: `ApiServerController` logs start/stop/auth-failures at appropriate levels. Auth failures logged at `warn` with source IP only (not the attempted token). Port binding failure logged at `error`.
- **Rollback**: `api_enabled` defaults to `false`. Disabling the toggle in Settings stops the server immediately. `api.key` can be deleted without data loss. `packages/poly/` is independent; removing it from the workspace doesn't affect the Electron app.

## Documentation

- [ ] `docs/api.md` — NDJSON framing, `api.authenticate` handshake, all methods with request/response shapes, `stream.chunk` streaming example, error code table, `POLYPHON_API_PORT` env var, remote access warning, TLS guidance (nginx/Caddy config snippets)
- [ ] `docs/poly.md` — installation (`npm i -g @polyphon-ai/poly`), all commands with examples, local auto-discovery, remote connection setup (`POLYPHON_HOST` / `POLYPHON_PORT` / `POLYPHON_TOKEN` / `POLYPHON_DATA_DIR`), CI/pipeline usage, security notes (token from file/env only)
- [ ] Update `docs/_index.md` navigation to include API and poly pages
- [ ] Update roadmap to mark TCP API as shipped

## Dependencies

- Node.js built-in `net` module — no new external dep for the Polyphon main process
- `packages/poly/`: `commander` (CLI parsing), `esbuild` (build) — no Electron
- npm workspaces (npm >= 7, Node.js 18+ already required)
