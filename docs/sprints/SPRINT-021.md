# Sprint 021: MCP Server Support

## Overview

Polyphon gains an embedded stdio MCP (Model Context Protocol) server, making its compositions
and sessions callable as tools by any MCP-compatible agent: Claude Code, Cursor, Codex CLI,
GitHub Copilot, Windsurf, Gemini CLI, and any future MCP client. This transforms Polyphon from
a standalone conductor's podium into a composable component in AI-powered workflows — an agent
can list compositions, create a session, broadcast a question to an entire ensemble, and retrieve
the full transcript, all via standard MCP tool calls.

The server runs over stdio — the universal MCP transport for local desktop tools. Two CLI flags
control the experience: `--mcp-server` activates the protocol, and `--headless` suppresses the
Electron window for use in agent scripts. A toggle in Settings persists the server state across
restarts so the MCP server can auto-start whenever Polyphon launches.

The core architectural change is introducing a `SessionEventSink` abstraction inside
`SessionManager` that separates "run a round" from "notify the GUI." The existing public API
for IPC callers is unchanged. New headless entry points (`runHeadlessBroadcastRound`,
`runHeadlessDirectedRound`) use a `CollectorSink` internally and return structured responses.
This is a targeted refactor with no visible effect on the existing GUI path.

## Use Cases

1. **Broadcast from an agent script**: An agent registers `polyphon --mcp-server --headless`,
   calls `polyphon_broadcast` with a composition ID and a question, and gets all voice responses
   returned synchronously — no GUI required.

2. **Ask a specific voice**: An agent uses `polyphon_ask` to direct a question to one named voice
   in a composition and get its response.

3. **Persistent multi-turn session**: An agent calls `polyphon_create_session` once, then sends
   multiple `polyphon_broadcast` calls in the same session, building shared context across turns.

4. **Retrieve conversation history**: An agent calls `polyphon_get_history` to fetch a full
   session transcript for downstream summarization or follow-up.

5. **GUI + MCP together**: A user enables the MCP toggle in Settings. External agents can call
   into the running app while the user watches the conversation in the desktop UI.

## Architecture

```
polyphon --mcp-server [--headless]
  ↓
src/main/index.ts — parse CLI flags
  ├── load key + open DB (always)
  ├── create VoiceManager + SessionManager (always)
  ├── if !--headless: createWindow() + registerIpcHandlers() + installCsp() + setupAutoUpdater()
  └── if --mcp-server OR app_settings.mcp_enabled=true: startMcpServer()
        ↓
      src/main/mcp/index.ts
        ↓
      McpServerController
        ├── start() / stop() / getStatus(): McpStatus
        └── app.quit() when stdio transport closes (headless mode)
        ↓
      @modelcontextprotocol/sdk StdioServerTransport
        ↓
      MCP Tools (factory functions, deps injected)
        ├── polyphon_list_compositions
        ├── polyphon_create_session
        ├── polyphon_broadcast    → runHeadlessBroadcastRound()
        ├── polyphon_ask          → runHeadlessDirectedRound()
        └── polyphon_get_history
```

### SessionEventSink Abstraction

`SessionManager` introduces a private `SessionEventSink` interface:

```typescript
interface SessionEventSink {
  onVoicePending?(sessionId: string, voiceId: string): void;
  onVoiceToken?(sessionId: string, voiceId: string, token: string): void;
  onVoiceDone?(sessionId: string, voiceId: string, roundIndex: number): void;
  onVoiceError?(sessionId: string, voiceId: string, error: string): void;
  onContinuationPrompt?(sessionId: string, roundIndex: number, voiceResponses: Message[]): void;
  onNoTarget?(sessionId: string): void;
}
```

- `BrowserWindowSink` (private class, constructed internally from `win: BrowserWindow`) — forwards to `win.webContents.send(...)`. Existing IPC callers are unchanged.
- `CollectorSink` (private class, constructed by headless methods) — accumulates token strings per voiceId, returns collected `Message[]` when the round completes.

New public methods added to `SessionManager`:
- `runHeadlessBroadcastRound(db, session, conductorMessage)` → `Promise<Message[]>`
- `runHeadlessDirectedRound(db, session, conductorMessage, targetVoiceId)` → `Promise<Message | null>`

### Headless Startup Contract

When `--headless` is passed:
- Load key material, open encrypted DB
- Create `VoiceManager` and `SessionManager`
- **Skip**: `createWindow()`, `registerIpcHandlers()`, `installCsp()`, `setupAutoUpdater()`
- Start MCP server (stdio transport)
- Call `app.quit()` when the stdio transport emits a close or error event

If the DB has `wrapping: 'password'` and `POLYPHON_DB_PASSWORD` is not set: exit with code 1
and a clear stderr message. No interactive unlock prompt in headless mode.

### Session Rehydration

When an MCP tool targets a session created in a prior app run, `VoiceManager` has no in-memory
ensemble for that session. `headless.ts` exports `ensureSessionInitialized(db, voiceManager, session)`,
which loads the composition from DB and calls `VoiceManager.createSession()` if the ensemble
is not already in memory. Called by `polyphon_broadcast` and `polyphon_ask` before running rounds.

### MCP Tool Contracts

All tool inputs validated via `src/main/ipc/validate.ts` before DB or VoiceManager access.
All tools return structured JSON.

| Tool | Key Inputs | Returns |
|---|---|---|
| `polyphon_list_compositions` | — | `{ compositions: { id, name, mode, continuationPolicy, voices: { id, name, provider }[] }[] }` |
| `polyphon_create_session` | `compositionId`, `name?`, `workingDir?`, `sandboxedToWorkingDir?` | `{ session: Session }` |
| `polyphon_broadcast` | `sessionId`, `content` | `{ responses: { voiceName, content }[], roundIndex }` |
| `polyphon_ask` | `sessionId`, `content`, `voiceName` | `{ voiceName, content, roundIndex }` |
| `polyphon_get_history` | `sessionId`, `limit?` | `{ session: Session, messages: Message[] }` |

### App Settings (Migration 013)

```sql
CREATE TABLE app_settings (
  key        TEXT PRIMARY KEY NOT NULL,
  value      TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
```

Keys used this sprint: `mcp_enabled` (`'true'` / `'false'`, default `'false'`).

`mcp_enabled = true` means: start the MCP server on app launch (GUI or headless mode).
The `--mcp-server` CLI flag always starts the server regardless of this setting.

Query helpers in `src/main/db/queries/appSettings.ts`:
- `getSetting(db, key): string | null`
- `setSetting(db, key, value): void`
- `getBooleanSetting(db, key, fallback): boolean`
- `setBooleanSetting(db, key, value): void`

App-setting keys live in `APP_SETTING_KEYS` constant (no magic strings):
```typescript
export const APP_SETTING_KEYS = {
  MCP_ENABLED: 'mcp_enabled',
} as const;
```

### IPC Channels

```typescript
// shared/constants.ts — added to IPC object
MCP_GET_STATUS:     'mcp:getStatus'
MCP_SET_ENABLED:    'mcp:setEnabled'
MCP_STATUS_CHANGED: 'mcp:statusChanged'
```

```typescript
// shared/types.ts
interface McpStatus {
  enabled: boolean;   // persisted desired state
  running: boolean;   // is the server currently active?
  headless: boolean;  // was the app launched with --headless?
  transport: 'stdio';
}
```

## Implementation Plan

### P0: Must Ship

#### 0. Transport Validation Spike (Do First)

**This task must complete before any other MCP work begins.**

The entire sprint rests on the assumption that `@modelcontextprotocol/sdk`'s `StdioServerTransport`
works correctly inside an Electron main process. Electron may buffer stdout, repurpose stdin, or
emit main-process log noise that corrupts the MCP JSON-RPC framing.

**Tasks:**
- [ ] Install `@modelcontextprotocol/sdk` and write a minimal spike: start `StdioServerTransport` in the main process, register a single no-op tool, verify a connected client can call it
- [ ] Verify app-level logging (via `logger.ts`) does not bleed into stdout during MCP mode — redirect logger to stderr or a file if needed
- [ ] If stdout is contaminated: evaluate named-pipe or custom transport as a fallback; update the architecture section before continuing
- [ ] **Gate**: no further MCP implementation work proceeds until this spike passes

#### 1. Dependency

**Files:** `package.json`
- [ ] Run `npm view @modelcontextprotocol/sdk version` and add at current latest with `^` range

#### 2. Database: Migration 013 + App Settings Queries

**Files:**
- `src/main/db/schema.ts` — bump `SCHEMA_VERSION` to 13; add `app_settings` to `CREATE_TABLES_SQL`
- `src/main/db/migrations/013_add_app_settings.ts` — `up(db)`: CREATE TABLE app_settings
- `src/main/db/migrations/index.ts` — `apply(13, migration013)`
- `src/main/db/queries/appSettings.ts` — `getSetting`, `setSetting`, `getBooleanSetting`, `setBooleanSetting`
- `src/shared/constants.ts` — add `APP_SETTING_KEYS`

**Tasks:**
- [ ] Bump SCHEMA_VERSION 12 → 13 in schema.ts
- [ ] Add `app_settings` table to `CREATE_TABLES_SQL`
- [ ] Write migration 013 file
- [ ] Register migration 013
- [ ] Write `appSettings.ts` query helpers
- [ ] Write `appSettings.integration.test.ts` (round-trip for boolean setting)

#### 3. Shared Types and IPC Constants

**Files:**
- `src/shared/types.ts` — add `McpStatus` interface
- `src/shared/constants.ts` — add `IPC.MCP_GET_STATUS`, `IPC.MCP_SET_ENABLED`, `IPC.MCP_STATUS_CHANGED`

**Tasks:**
- [ ] Add `McpStatus` to shared types
- [ ] Add MCP IPC constants to IPC object

#### 4. SessionManager Refactor

**Files:**
- `src/main/managers/SessionManager.ts` — private `SessionEventSink`, `BrowserWindowSink`, `CollectorSink`; new `runHeadlessBroadcastRound()` and `runHeadlessDirectedRound()` public methods; internal refactor of `streamVoice()`, `runBroadcastRound()`, `runDirectedRound()`
- `src/main/managers/SessionManager.test.ts` — add tests for headless round execution without BrowserWindow

**Tasks:**
- [ ] Add private `SessionEventSink` interface
- [ ] Add private `BrowserWindowSink` class (wraps `win.webContents.send`)
- [ ] Add private `CollectorSink` class (accumulates tokens per voiceId)
- [ ] Refactor `streamVoice()` to accept `SessionEventSink` instead of `BrowserWindow`
- [ ] Refactor `runBroadcastRound()` and `runDirectedRound()` internal implementations; keep existing public signatures unchanged
- [ ] Add `runHeadlessBroadcastRound(db, session, conductorMessage)` public method
- [ ] Add `runHeadlessDirectedRound(db, session, conductorMessage, targetVoiceId)` public method
- [ ] Update SessionManager unit tests; all existing tests pass unchanged
- [ ] Add tests: headless round runs to completion without mocking BrowserWindow

#### 5. MCP Headless Helpers

**Files:**
- `src/main/mcp/headless.ts` — `ensureSessionInitialized()`, exports for headless orchestration
- `src/main/mcp/headless.test.ts` — unit tests

**Tasks:**
- [ ] `ensureSessionInitialized(db, voiceManager, session)` — loads composition + creates ensemble if not in memory
- [ ] Verify CLI voices do not receive tools in headless path (existing VoiceManager constraint)
- [ ] Unit test: session rehydrated correctly from DB when VoiceManager has no entry
- [ ] Unit test: already-initialized session is not double-initialized

#### 6. MCP Tool Handlers

**Files:**
- `src/main/mcp/tools/listCompositions.ts`
- `src/main/mcp/tools/createSession.ts`
- `src/main/mcp/tools/broadcast.ts`
- `src/main/mcp/tools/ask.ts`
- `src/main/mcp/tools/getHistory.ts`
- `src/main/mcp/tools/index.ts` — `buildMcpTools(deps)` factory
- `src/main/mcp/tools/*.test.ts` — one test file per tool

All tool handlers: factory functions receiving `{ voiceManager, sessionManager, db }`.
All tool inputs validated using `src/main/ipc/validate.ts` before DB/VoiceManager access.

**Tasks:**
- [ ] `listCompositions` — list non-archived compositions with voice summaries
- [ ] `createSession` — create session from composition, support `workingDir` + `sandboxedToWorkingDir`; validate and normalize `workingDir` path (must be absolute; must exist on disk if provided); reject invalid paths with structured MCP error
- [ ] `broadcast` — call `ensureSessionInitialized`, insert conductor message, call `runHeadlessBroadcastRound`, return responses
- [ ] `ask` — resolve voice by display name, call `ensureSessionInitialized`, insert conductor message, call `runHeadlessDirectedRound`, return response; if multiple voices share the same display name, return a structured error listing all matching voice IDs
- [ ] `getHistory` — return ordered messages for session, support optional `limit`
- [ ] Unit test for each tool: happy path, missing composition/session, missing voice name, **duplicate voice names**, invalid workingDir path

#### 7. McpServerController and Server Module

**Files:**
- `src/main/mcp/server.ts` — `McpServerController` class: `start()`, `stop()`, `getStatus()`, status change callback
- `src/main/mcp/index.ts` — `startMcpServer(deps)`, `stopMcpServer()`, `getMcpStatus()`

**Tasks:**
- [ ] `McpServerController`: wraps `@modelcontextprotocol/sdk` `Server` + `StdioServerTransport`
- [ ] `start()` is idempotent; `stop()` is safe when already stopped
- [ ] On stdio transport close/error: invoke close callback (headless mode uses this to call `app.quit()`)
- [ ] Status change callbacks notify renderer via IPC (GUI mode only)
- [ ] `src/main/mcp/` must not import `BrowserWindow` from electron

#### 8. IPC Handlers + Preload

**Files:**
- `src/main/ipc/mcpHandlers.ts` — `registerMcpHandlers(ipcMain, db, mcpController, win)`
- `src/main/ipc/index.ts` — call `registerMcpHandlers`
- `src/main/preload.ts` — expose `mcp.getStatus`, `mcp.setEnabled`, `mcp.onStatusChanged`

**Tasks:**
- [ ] `MCP_GET_STATUS` handler: return `McpStatus` from controller + `app_settings`
- [ ] `MCP_SET_ENABLED` handler: write `app_settings`, start/stop controller, push `MCP_STATUS_CHANGED`
- [ ] Register in `ipc/index.ts`
- [ ] Expose MCP API in preload bridge
- [ ] Integration test: `MCP_GET_STATUS` returns correct status; `MCP_SET_ENABLED` toggles state

#### 9. Settings UI

**Files:**
- `src/renderer/components/Settings/McpSection.tsx` — MCP toggle card
- `src/renderer/components/Settings/SettingsPage.tsx` — add `McpSection`

**Tasks:**
- [ ] Card: "MCP Server" heading; description ("Expose Polyphon as an MCP tool server for Claude Code, Cursor, and other AI agents")
- [ ] Toggle: enable/disable; label changes "Running" / "Stopped"; status indicator
- [ ] Warning when enabled: "MCP agents can use any tools enabled on a composition's voices, including write_file and run_command"
- [ ] Load current status on mount; subscribe to `MCP_STATUS_CHANGED`
- [ ] Connect instructions shown when running: `polyphon --mcp-server --headless`

#### 10. CLI Flags and Entry Point

**Files:**
- `src/main/index.ts`

**Tasks:**
- [ ] Parse `process.argv` for `--mcp-server` and `--headless`
- [ ] Headless mode: skip `createWindow()`, `registerIpcHandlers()`, `installCsp()`, `setupAutoUpdater()`
- [ ] Check `POLYPHON_DB_PASSWORD` env var in headless mode; if DB is password-protected and env var absent: `process.stderr.write(...)` + `process.exit(1)`
- [ ] Logger sanitization: add `POLYPHON_DB_PASSWORD` value to redaction set at startup
- [ ] Auto-start MCP if `getBooleanSetting(db, APP_SETTING_KEYS.MCP_ENABLED, false) === true`
- [ ] `--mcp-server` flag starts MCP server regardless of `app_settings`
- [ ] Wire `McpServerController` close callback to `app.quit()` in headless mode

#### 11. Documentation

**Files:**
- `site/content/docs/mcp.md` — new MCP docs page
- `site/content/docs/_index.md` — add MCP to navigation
- `site/content/roadmap.md` — mark MCP as shipped

`mcp.md` must cover:
1. What is MCP (one paragraph for users unfamiliar with the protocol)
2. Why it matters for Polyphon (use cases, agent workflow integration)
3. **Supported agents with full config snippets**:
   - Claude Code: `claude mcp add polyphon -- /path/to/polyphon --mcp-server`
   - Cursor: `~/.cursor/mcp.json` snippet
   - Codex CLI: config snippet
   - GitHub Copilot: config snippet
   - Windsurf: config snippet
   - Gemini CLI: config snippet
4. CLI flags: `--mcp-server`, `--headless`
5. Settings toggle: description + screenshot placeholder
6. Available tools: table (name, inputs, description)
7. Security model: local stdio only, no network listener, tool capability inheritance warning
8. Example use cases: 3 concrete multi-agent workflow examples

**Tasks:**
- [ ] Write `site/content/docs/mcp.md` with all sections above
- [ ] Add MCP to `site/content/docs/_index.md` navigation list
- [ ] Update `site/content/roadmap.md` — MCP server support: shipped

#### 12. Basic E2E Test

**Files:**
- `e2e/mcp.spec.ts` — MCP launch + tool call test

**Tasks:**
- [ ] E2E test: launch app with `--mcp-server`, connect a minimal MCP client, call `polyphon_list_compositions`, verify structured response returned
- [ ] E2E test: Settings toggle starts/stops the server (GUI mode)

### P1: Ship If Capacity Allows

- [ ] "Copy config snippet" button in `McpSection.tsx` — copies the `--mcp-server` invocation for each supported agent
- [ ] Add MCP running state to About / Debug Info page
- [ ] Blog post: `site/content/blog/mcp-server.md` — announce the feature with agent workflow examples

### Deferred

- **Unix socket / HTTP transport** — stdio is correct for local MCP; remote access requires a different security model
- **MCP server auth/token layer** — stdio already implies local process ownership; address separately if needed
- **`polyphon_abort`** — abort an in-progress round; requires abort controller tracking in the headless path
- **Streaming partial tokens via MCP** — MCP 1.x doesn't support streaming tool results; block-and-return is correct
- **Session creation from inline voice definitions** — requires a new composition-less session model

## Files Summary

| File | Action | Purpose |
|---|---|---|
| `package.json` | Modify | Add `@modelcontextprotocol/sdk ^x.y.z` |
| `src/main/db/schema.ts` | Modify | SCHEMA_VERSION 13; `app_settings` in CREATE_TABLES_SQL |
| `src/main/db/migrations/013_add_app_settings.ts` | Create | Migration: app_settings table |
| `src/main/db/migrations/index.ts` | Modify | Register migration 013 |
| `src/main/db/queries/appSettings.ts` | Create | getSetting / setSetting / getBooleanSetting / setBooleanSetting |
| `src/main/db/queries/appSettings.integration.test.ts` | Create | Round-trip tests |
| `src/shared/types.ts` | Modify | Add McpStatus |
| `src/shared/constants.ts` | Modify | Add MCP IPC constants; APP_SETTING_KEYS |
| `src/main/managers/SessionManager.ts` | Modify | SessionEventSink abstraction; new headless public methods |
| `src/main/managers/SessionManager.test.ts` | Modify | Add headless round tests |
| `src/main/ipc/handlers.ts` (voice:send) | Modify | Verify BrowserWindowSink construction (if needed) |
| `src/main/mcp/headless.ts` | Create | ensureSessionInitialized + headless orchestration helpers |
| `src/main/mcp/headless.test.ts` | Create | Session rehydration tests |
| `src/main/mcp/tools/listCompositions.ts` | Create | MCP tool handler |
| `src/main/mcp/tools/createSession.ts` | Create | MCP tool handler |
| `src/main/mcp/tools/broadcast.ts` | Create | MCP tool handler |
| `src/main/mcp/tools/ask.ts` | Create | MCP tool handler |
| `src/main/mcp/tools/getHistory.ts` | Create | MCP tool handler |
| `src/main/mcp/tools/index.ts` | Create | Tool registry / factory |
| `src/main/mcp/tools/*.test.ts` (5 files) | Create | Per-tool unit tests |
| `src/main/mcp/server.ts` | Create | McpServerController class |
| `src/main/mcp/index.ts` | Create | MCP lifecycle (startMcpServer / stopMcpServer) |
| `src/main/ipc/mcpHandlers.ts` | Create | MCP IPC handlers (GET_STATUS / SET_ENABLED) |
| `src/main/ipc/index.ts` | Modify | Register MCP handlers |
| `src/main/preload.ts` | Modify | Expose mcp API to renderer |
| `src/renderer/components/Settings/McpSection.tsx` | Create | Settings toggle UI |
| `src/renderer/components/Settings/SettingsPage.tsx` | Modify | Add McpSection |
| `src/main/index.ts` | Modify | CLI flag parsing; headless startup; POLYPHON_DB_PASSWORD |
| `src/main/utils/logger.ts` | Modify | Add passphrase to redaction set |
| `site/content/docs/mcp.md` | Create | MCP documentation page |
| `site/content/docs/_index.md` | Modify | Add MCP to navigation |
| `site/content/roadmap.md` | Modify | Mark MCP as shipped |

## Definition of Done

**Transport (must prove, not just assume):**
- [ ] Transport spike passes: `StdioServerTransport` starts in Electron main process and a connected MCP client can successfully call a tool
- [ ] Logger output does not contaminate stdout during MCP mode (verified by checking JSON-RPC framing is unbroken under normal app logging)
- [ ] MCP server handles orderly shutdown: when stdio closes, `app.quit()` is called (no zombie process)

**Functionality:**
- [ ] `polyphon --mcp-server` starts the app and MCP server begins serving on stdio
- [ ] `polyphon --mcp-server --headless` serves MCP without opening a BrowserWindow
- [ ] All 5 MCP tools are callable and return correct structured JSON responses
- [ ] `polyphon_broadcast` blocks until all voices respond and returns `{ responses, roundIndex }`
- [ ] `polyphon_ask` resolves voice by display name; returns a clear error for unknown voice names
- [ ] `polyphon_ask` returns a structured error listing all matching voice IDs when two voices share the same display name
- [ ] `polyphon_create_session` validates `workingDir` is absolute and exists; rejects invalid paths with a structured MCP error (not a crash)
- [ ] `polyphon_broadcast` and `polyphon_ask` work on sessions from prior app runs (rehydration)
- [ ] Settings toggle starts/stops the server and updates the status indicator in real time
- [ ] `mcp_enabled = true` in `app_settings` causes the MCP server to start on next launch
- [ ] `--mcp-server` flag always starts the server regardless of `app_settings`
- [ ] Migration 013 applies cleanly from schema version 12; fresh installs get `app_settings` directly
- [ ] GUI + MCP coexistence: with `--mcp-server` (GUI visible), a session created via the GUI can receive a `polyphon_broadcast` call without corrupting the GUI message feed or causing double-events

**Security:**
- [ ] All MCP tool inputs validated via `validate.ts` before DB/VoiceManager access
- [ ] `POLYPHON_DB_PASSWORD` env var accepted in headless mode; value never appears in logs
- [ ] `logger.ts` redaction set updated to include DB passphrase value
- [ ] Headless + password-protected DB without `POLYPHON_DB_PASSWORD`: exits with code 1 + clear message
- [ ] `grep -r 'BrowserWindow' src/main/mcp/` returns empty (no electron GUI dep in MCP module)
- [ ] `McpSection.tsx` warning displayed when write-capable voice tools are configured

**Lifecycle:**
- [ ] `app.quit()` called when stdio transport closes in headless mode (no zombie processes)
- [ ] Headless mode skips IPC handler registration, CSP installation, and auto-updater

**Quality:**
- [ ] All existing tests pass (`make test`)
- [ ] New unit tests pass for all 5 MCP tool handlers
- [ ] `appSettings` integration test passes
- [ ] `SessionManager` headless round tests pass (no BrowserWindow mock needed)
- [ ] `ensureSessionInitialized` tests pass (session rehydration from DB)

**Documentation:**
- [ ] `site/content/docs/mcp.md` exists with all required sections
- [ ] Config snippets present for all 6 supported agents
- [ ] MCP page in `docs/_index.md` navigation
- [ ] Roadmap updated to show MCP as shipped
- [ ] Manually verified: Claude Code can call `polyphon_list_compositions` on a running server

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| `StdioServerTransport` conflicts with Electron's stdout use | **High** | **High** | **Spike first** — do not proceed past §0 without passing the transport validation spike |
| SessionManager refactor changes observable event behavior (timing, ordering) even with unchanged signatures | Medium | High | All existing unit and e2e tests must pass without modification; treat any test regression as a blocker |
| Session rehydration is incomplete for edge cases (e.g., custom providers not loaded yet) | Medium | Medium | `ensureSessionInitialized` must re-run full `VoiceManager.createSession()` logic including custom provider and tone lookup |
| Headless startup silently depends on skipped subsystems (IPC, CSP) for initialization side effects | Medium | Medium | Audit `index.ts` startup sequence for hidden dependencies before splitting the paths; integration-test headless startup in isolation |
| Sprint ships a passing demo but fragile behavior in edge cases (duplicate voice names, GUI+MCP concurrency, complex sessions) | Medium | Medium | Expanded DoD criteria above; E2E test is P0 not P1 |
| Agent config snippets for all 6 clients introduce verification burden | Medium | Low | Test with Claude Code as primary; note in docs which snippets are community-contributed vs. verified |

## Security Considerations

- **Stdio transport is local-only** — no network listener, no port. Only the process that spawned `polyphon --mcp-server` can communicate with it.
- **No auth layer on stdio** — this matches the security model of all local MCP servers (Claude Code, Cursor, etc.). The OS provides process isolation.
- **Tool capability inheritance** — MCP `polyphon_broadcast` calls to a session with `write_file` or `run_command` enabled will exercise those tools. Documented in `docs/mcp.md` and warned in `McpSection.tsx`.
- **DB passphrase handling** — accepted via `POLYPHON_DB_PASSWORD` env var (not CLI arg to avoid `/proc/cmdline` exposure). Never logged. Logger redaction updated.
- **Headless DB unlock** — if the DB requires a password and no env var is set, headless mode exits immediately with a clear error. No interactive prompt is shown.

## Observability & Rollback

- **Verification post-ship**: `claude mcp add polyphon -- /path/to/polyphon --mcp-server --headless`, then call `polyphon_list_compositions` from Claude Code.
- **Logs**: MCP lifecycle events (server start, stop, tool call names, errors) logged via `logger.info/debug` with `[mcp]` prefix.
- **Rollback**: the MCP module is purely additive. Removing `--mcp-server` from an agent config restores prior behavior. The `app_settings` table is append-only; reverting SCHEMA_VERSION to 12 would drop the table but leave all other data intact.

## Dependencies

- SPRINT-020 (FTS5, migration 012) — complete; migration 013 follows cleanly.
- `@modelcontextprotocol/sdk` — confirm npm availability before starting; latest stable, `^` range.
