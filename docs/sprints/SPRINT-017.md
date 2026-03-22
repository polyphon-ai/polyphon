# Sprint 017: Voice Filesystem Tools

## Sprint Theme

**Let API voices read, write, and list files on the local machine — with per-voice tool
selection in the composition builder, full OS-level access, and no new process boundaries.**

---

## Overview

API voices in Polyphon communicate through a prompt/response cycle. This sprint adds
**tool use**: the ability for API voices to interact with the local filesystem during a
session. Users choose which tools (read file, write file, list directory) to enable per
voice when building a composition. The enabled set is persisted in `composition_voices`,
injected into `VoiceConfig` at session init, and included in API requests.

When a voice calls a tool, the main process executes it locally, emits a `[tool: name]`
inline token into the response stream, feeds the result back to the model, and continues
until the model returns final text. The loop is capped at `MAX_TOOL_ROUNDS = 10` to prevent
runaway execution.

Scope for this sprint: **Anthropic, OpenAI, and OpenAI-compatible voices**. Gemini is
deferred pending TypeScript SDK verification. CLI voices are excluded — they use a
subprocess model incompatible with the tool-use protocol.

This sprint is intentionally additive:
- No filesystem sandbox (full OS-level access)
- No new IPC channels
- No new renderer process execution
- No plugin system or custom scripting

---

## Use Cases

1. **Code assistant with file access** — an API voice has `read_file` and `write_file`
   enabled. The conductor asks it to refactor a file; the voice reads it, applies changes,
   writes it back.
2. **Read-only research voice** — only `read_file` enabled. Voice can reference local docs
   without any write capability.
3. **Directory-aware voice** — `list_directory` enabled. Voice discovers project structure
   before answering architectural questions.
4. **Mixed-trust ensemble** — one voice has full tool access; another has none. Each receives
   only the tools configured for it.
5. **Composition reload** — enabled tools persist with the composition and come back correctly
   when the app restarts.
6. **Streaming visibility** — when a tool runs, the conductor sees `[tool: read_file]` inline
   in the voice response without needing a new transcript surface.

---

## Architecture

```
CompositionBuilder / VoiceOrderList
  ↓ (per-voice tool toggles, API voices only)
CompositionVoice.enabledTools: string[]
  ↓ (IPC validation — must be known tool names)
SQLite composition_voices.enabled_tools (TEXT JSON)
  ↓ (loaded at session init)
VoiceManager.createVoice() → VoiceConfig.enabledTools
  ↓
provider.send(messages)
  ├─ resolve tool definitions from TOOL_REGISTRY
  ├─ serialize tool list to provider format
  ├─ stream initial response
  └─ if tool calls in response:
       executeToolLoop() [protected helper in APIVoice]:
         execute tool locally (main process)
         emit "[tool: name]" token
         append tool_use + tool_result to in-memory messages
         send follow-up request
         repeat (max MAX_TOOL_ROUNDS = 10)
       yield final text tokens
```

### New module: `src/main/tools/`

```
src/main/tools/
├── types.ts           # ToolDefinition, ToolCallResult interfaces
├── readFile.ts        # read_file executor
├── writeFile.ts       # write_file executor
├── listDirectory.ts   # list_directory executor
├── index.ts           # TOOL_REGISTRY, resolveTools()
└── *.test.ts          # unit tests per executor + registry
```

**ToolDefinition (provider-agnostic):**

```typescript
interface ToolDefinition {
  name: string
  description: string
  parameters: {
    type: 'object'
    properties: Record<string, { type: string; description: string }>
    required: string[]
  }
  execute: (args: Record<string, unknown>) => Promise<string>
}
```

**Provider serialization:**

| Provider | Tool format |
|---|---|
| Anthropic | `{ name, description, input_schema: { type, properties, required } }` |
| OpenAI | `{ type: 'function', function: { name, description, parameters } }` |
| OpenAI-compat | same as OpenAI |

**Tool call loop — shared protected helper in APIVoice:**

```typescript
// Called from each provider's send() after the initial stream completes
// when tool calls are detected in the response.
protected async *executeToolLoop(
  toolCalls: ToolCall[],
  tools: ToolDefinition[],
  appendMessages: (tc: ToolCall, result: string) => void,
  continueStream: () => AsyncIterable<string>,
  maxRounds = MAX_TOOL_ROUNDS
): AsyncIterable<string>
```

**Conversation persistence:**
Tool_use / tool_result blocks exist only in the in-memory message array during the
multi-round request. They are not stored in SQLite. The final streamed voice response
(including `[tool: name]` tokens) is persisted as the `messages.content` value, consistent
with how streaming works today.

---

## Implementation Plan

### P0: Must Ship

#### 1. Tools module

**New files:** `src/main/tools/types.ts`, `readFile.ts`, `writeFile.ts`,
`listDirectory.ts`, `index.ts`, `*.test.ts`

- [ ] Define provider-agnostic `ToolDefinition` and `ToolCallResult` interfaces
- [ ] Implement `read_file`:
  - Resolve path via `path.resolve()` before any FS operation
  - Read as UTF-8; on encoding error or binary file, return `"Binary or non-UTF-8 file; cannot read as text."`
  - Truncate at 50 KB; append `"\n... (truncated at 50 KB)"` when truncated
  - Return sanitized error messages (no raw OS error strings with absolute paths; use basename only)
- [ ] Implement `write_file`:
  - Resolve path via `path.resolve()` before any FS operation
  - Overwrites existing files by default (no append mode)
  - Write is atomic: write to a `.tmp` sibling file, then rename to target path
  - Create immediate parent directory if it does not exist (one level only; not recursive mkdir -p)
  - Return sanitized error messages
- [ ] Implement `list_directory`:
  - Resolve path via `path.resolve()` before any FS operation
  - Recursive listing; default max depth = 3; caller may not request deeper
  - Max 500 entries; truncate with a `"... (listing truncated)"` note
  - Output sorted alphabetically; relative paths from the requested root
  - Skip symlinked directories (do not follow); skip permission-denied entries silently
  - Return sanitized error messages
- [ ] Export `TOOL_REGISTRY: Record<string, ToolDefinition>` and `resolveTools(names: string[]): ToolDefinition[]`
- [ ] `AVAILABLE_TOOLS` in `shared/constants.ts` is the single source of truth for tool names, labels, and
  descriptions (used by renderer for display AND by IPC validation for allowed names);
  `TOOL_REGISTRY` in `src/main/tools/index.ts` maps the same names to executors
- [ ] Unit tests: UTF-8 normal cases, binary file graceful error, 50 KB truncation, missing file,
  write success, write creates parent dir, atomic write (rename pattern), list empty dir,
  list over 500 entries truncation, list respects max depth, `path.resolve()` normalization
- [ ] All tool executor errors return structured error strings, never throw to the loop

#### 2. Schema and migration

**Modified:** `src/main/db/schema.ts`, `src/main/db/migrations/009_add_enabled_tools.ts`,
`src/main/db/migrations/index.ts`

- [ ] Add `enabled_tools TEXT NOT NULL DEFAULT '[]'` to `composition_voices` in
  `CREATE_TABLES_SQL`
- [ ] Bump `SCHEMA_VERSION` to `9`
- [ ] Write `009_add_enabled_tools.ts`: `ALTER TABLE composition_voices ADD COLUMN enabled_tools TEXT NOT NULL DEFAULT '[]'`
- [ ] Register `009` in `migrations/index.ts`
- [ ] Integration test: migration 009 upgrades existing schema correctly

#### 3. Types, constants, persistence

**Modified:** `src/shared/types.ts`, `src/shared/constants.ts`,
`src/main/db/queries/compositions.ts`, `src/main/ipc/validate.ts`

- [ ] Add `enabledTools?: string[]` to `CompositionVoice` in `types.ts`
- [ ] Add `AVAILABLE_TOOLS: Array<{ name: string; label: string; description: string }>` to
  `constants.ts` for renderer display (labels, descriptions)
- [ ] `compositionVoiceToRow()`: `JSON.stringify(enabledTools ?? [])`
- [ ] `rowToCompositionVoice()`: `JSON.parse(enabled_tools)`
- [ ] IPC validation: `enabledTools` must be an array of strings, each a key in
  `TOOL_REGISTRY`; unknown or duplicate names rejected
- [ ] Integration test: composition create/update round-trips `enabledTools` correctly

#### 4. VoiceConfig and VoiceManager

**Modified:** `src/main/voices/Voice.ts`, `src/main/managers/VoiceManager.ts`

- [ ] Add `enabledTools?: string[]` to `VoiceConfig`
- [ ] `createVoice()`: pass `compositionVoice.enabledTools` into `VoiceConfig`
- [ ] CLI voices: explicit `type === 'cli'` check in `createVoice()` — tools are never passed to CLI voices (not just silently ignored via empty array)
- [ ] Unit/integration test: enabled tools flow from `CompositionVoice` → `VoiceConfig`

#### 5. Tool-call loop (APIVoice) and provider serialization

**Modified:** `src/main/voices/APIVoice.ts`, `src/main/voices/providers/anthropic.ts`,
`src/main/voices/providers/openai.ts`, `src/main/voices/providers/openai-compat.ts`

- [ ] Add `MAX_TOOL_ROUNDS = 10` constant; enforce in loop with error token on overflow
- [ ] Add protected `executeToolLoop()` helper to `APIVoice` (shared logic, called from
  provider `send()` when tool calls are present in response)
- [ ] Preserve existing abort behavior across multi-round tool execution
- [ ] Anthropic: serialize `enabledTools` → `tools[]` in request; parse `tool_use` blocks
  from response; format `tool_result` for follow-up
- [ ] OpenAI: serialize `enabledTools` → `tools[]` in request; parse `tool_calls` from
  response; format tool results for follow-up
- [ ] OpenAI-compat: uses same serialization as OpenAI (same provider format); ensure tools
  flow through `OpenAICompatVoice.send()` identically
- [ ] Emit `[tool: <name>]` token before each local tool execution
- [ ] Log each tool invocation: `logger.debug('tool:execute', { name, voiceId })`
- [ ] Log tool errors: `logger.warn('tool:error', { name, voiceId, error: error.message })`
- [ ] Unit tests: Anthropic tool serialization output (assert correct JSON shape);
  OpenAI tool serialization output; MAX_TOOL_ROUNDS overflow behavior

#### 6. UI: per-voice tool selector

**Modified:** `src/renderer/components/Composition/VoiceOrderList.tsx`,
`src/renderer/store/composition.ts` (if needed)

- [ ] In the per-voice edit panel, add a "Tools" section using `AVAILABLE_TOOLS` from
  `constants.ts` for labels and descriptions
- [ ] Tool controls appear only for `type: 'api'` voices; hidden for CLI voices
- [ ] Checkboxes map to `enabledTools` array on the `CompositionVoice`
- [ ] Default: no tools enabled on a new voice
- [ ] Existing compositions without `enabledTools` treat it as `[]` (no change in behavior)

### P1: Ship If Capacity Allows

- [ ] `openai-compat` tool support (likely falls out of OpenAI work naturally — verify)
- [ ] Integration test confirming `openai-compat` voices receive tools correctly

### Deferred

- Gemini tool support — SDK function-calling format needs verification
- Filesystem sandbox / session working-directory scoping — future sprint
- `run_command` tool — requires additional security review
- Richer tool activity UI (styled badge in MessageBubble)
- Custom user-defined tools / plugin architecture

---

## Files Summary

| File | Action | Purpose |
|---|---|---|
| `src/main/tools/types.ts` | Create | ToolDefinition, ToolCallResult interfaces |
| `src/main/tools/readFile.ts` | Create | read_file executor |
| `src/main/tools/writeFile.ts` | Create | write_file executor |
| `src/main/tools/listDirectory.ts` | Create | list_directory executor |
| `src/main/tools/index.ts` | Create | TOOL_REGISTRY, resolveTools() |
| `src/main/tools/*.test.ts` | Create | Unit tests for each executor |
| `src/shared/types.ts` | Modify | enabledTools on CompositionVoice |
| `src/shared/constants.ts` | Modify | AVAILABLE_TOOLS list |
| `src/main/voices/Voice.ts` | Modify | enabledTools on VoiceConfig |
| `src/main/voices/APIVoice.ts` | Modify | executeToolLoop() helper + MAX_TOOL_ROUNDS |
| `src/main/voices/providers/anthropic.ts` | Modify | Tool serialization + tool_use parsing |
| `src/main/voices/providers/openai.ts` | Modify | Tool serialization + tool_calls parsing |
| `src/main/voices/providers/openai-compat.ts` | Modify | Tools flow-through (same as OpenAI) |
| `src/main/managers/VoiceManager.ts` | Modify | Pass enabledTools into VoiceConfig |
| `src/main/db/schema.ts` | Modify | enabled_tools column; SCHEMA_VERSION → 9 |
| `src/main/db/migrations/009_add_enabled_tools.ts` | Create | ALTER TABLE migration |
| `src/main/db/migrations/index.ts` | Modify | Register migration 009 |
| `src/main/db/queries/compositions.ts` | Modify | Serialize/deserialize enabled_tools |
| `src/main/ipc/validate.ts` | Modify | Validate enabledTools field |
| `src/renderer/components/Composition/VoiceOrderList.tsx` | Modify | Per-voice tool selector UI |
| `CLAUDE.md` | Modify | Document tools module, new column, CLI exclusion |

---

## Definition of Done

**Persistence:**
- [ ] `composition_voices.enabled_tools` column exists in fresh installs and migrated DBs
- [ ] `enabledTools` round-trips correctly through composition save/reload
- [ ] Migration 009 runs cleanly; `SCHEMA_VERSION` is 9
- [ ] IPC validation rejects unknown or malformed tool names

**Behavior:**
- [ ] Anthropic API voices execute tool calls end-to-end (read_file, write_file, list_directory)
- [ ] OpenAI API voices execute tool calls end-to-end
- [ ] Tool-call loop stops at `MAX_TOOL_ROUNDS = 10` and emits an error token if exceeded
- [ ] Abort (voice:abort) stops tool loops mid-round correctly
- [ ] `[tool: <name>]` inline token appears in the streamed response for each tool call
- [ ] CLI voices are unaffected; tool config is silently ignored
- [ ] No new IPC channels were added

**UI:**
- [ ] Tool selector appears only for API-type voices in CompositionBuilder
- [ ] Default is no tools enabled on a new voice
- [ ] Existing compositions with no `enabledTools` behave identically to before

**Tool executor correctness:**
- [ ] All paths resolved via `path.resolve()` before any FS operation
- [ ] `read_file` handles binary/non-UTF-8 files gracefully (returns error string, no throw)
- [ ] `read_file` truncates at 50 KB with a truncation note
- [ ] `write_file` overwrites atomically via temp-file-rename; no partial writes on interruption
- [ ] `list_directory` caps at depth 3 and 500 entries; sorts output; skips symlinks and denied entries
- [ ] Tool executor error messages are sanitized (no raw OS error strings with absolute paths)

**UI risk communication:**
- [ ] `write_file` description in `AVAILABLE_TOOLS` explicitly warns that the voice can overwrite any file the user has permission to modify
- [ ] Tool selector visually distinguishes write-capable tools from read-only tools

**Tests:**
- [ ] Tool executor unit tests pass (normal cases + error cases + truncation + path normalization + binary files)
- [ ] Provider tool serialization unit tests pass (Anthropic and OpenAI assert correct JSON shape)
- [ ] VoiceManager integration test: enabled tools reach VoiceConfig for API voices; CLI voices receive no tools
- [ ] Composition query integration test: enabled_tools persists and hydrates
- [ ] Migration 009 integration test
- [ ] `make test-unit` passes
- [ ] `make test-integration` passes

**Documentation:**
- [ ] CLAUDE.md updated: `src/main/tools/` module documented
- [ ] CLAUDE.md updated: `enabled_tools` column noted in Database section
- [ ] CLAUDE.md updated: CLI voices do not support tool use
- [ ] CLAUDE.md updated: `enabled_tools` confirmed NOT in encryption manifest

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Provider SDK tool-call response format differs from docs | Medium | High | Narrow, unit-tested per-provider serialization; easy to patch |
| Tool loop doesn't terminate (model keeps calling tools) | Medium | High | `MAX_TOOL_ROUNDS = 10` hard cap; error token on overflow; verified in DoD |
| Large file reads bloat follow-up prompts | Medium | Medium | 50 KB truncation cap with truncation note appended |
| write_file overwrites critical files | Low | High | No sandbox in this sprint; users have opted in. Document in release notes. |
| openai-compat tool format edge cases | Low | Medium | Explicit handling in openai-compat.ts; covered by unit tests |
| Gemini deferral causes user confusion | Low | Low | Tool selector hidden for Gemini voices (Gemini is type='api' — handle by checking provider) |

---

## Security Considerations

- Tool execution is **main-process only** — never in the renderer
- No new IPC channels; tools are resolved at session init, same as system prompts
- `enabled_tools` stores tool names only (not paths or content) — not an encrypted field
- This sprint **intentionally does not sandbox** filesystem access. That is a deliberate
  scope decision, not an omission. Users who enable `write_file` on a voice are granting
  that voice write access to their machine. This will be documented prominently in the UI.
- All tool invocations logged via `logger` (already sanitized); file content is never logged
- Tool executor errors are caught and returned as structured error strings; they never
  propagate as unhandled exceptions into the stream
- **Prompt injection risk (High, accepted by design):** a voice reading a file containing
  adversarial instructions could trigger unintended tool calls. Mitigation: UI makes
  `write_file` capability explicit; user has opted in.
- **write_file blast radius (High, accepted by design):** no sandbox means a voice can
  write to any user-accessible path. Documented in tool description; user has opted in.
- Tool error messages sanitized — no raw OS error strings with absolute paths returned to model
- All executor paths normalized via `path.resolve()` before FS operations

---

## Observability & Rollback

**Observability:**
- `[tool: <name>]` inline token visible in every session where a tool is called
- `logger.debug('tool:execute', { name, voiceId })` for every invocation
- `logger.warn('tool:error', { name, voiceId, error: error.message })` for failures
- `logger.warn('tool:max-rounds', { voiceId, rounds })` when cap is hit

**Rollback:**
- `ADD COLUMN ... DEFAULT '[]'` is additive; existing rows get empty arrays; no data loss
- Removing `enabledTools` from `VoiceManager.createVoice()` disables the feature entirely
  without requiring a schema rollback
- Provider tool serialization is isolated per provider — reverting a single provider is
  a targeted change

---

## Documentation

- [ ] CLAUDE.md: document `src/main/tools/` module structure and `AVAILABLE_TOOLS` constant
- [ ] CLAUDE.md: add `enabled_tools` to the Database → Schema section for `composition_voices`
- [ ] CLAUDE.md: note CLI voices do not support tool use
- [ ] CLAUDE.md: confirm `enabled_tools` is intentionally absent from the encryption manifest

---

## Dependencies

- None; all P0 work is self-contained within the existing provider pattern
- Gemini tool support is a follow-up sprint item with no blocking dependency on this sprint

---

## Open Questions

*(All resolved as of sprint planning)*

1. **Sandbox**: Dropped for this sprint. Future sprint: session workingDir + opt-in sandbox
   checkbox for API voices.
2. **Gemini**: Deferred. Will require verifying `@google/generative-ai` SDK tool format.
3. **Tool activity UI**: Inline `[tool: name]` token. Styled badge is a future P1.
4. **Conversation persistence**: Tool_use/tool_result in-memory only during request. Final
   streamed response (with inline tokens) is what gets stored in SQLite.
