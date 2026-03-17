# Sprint 008: CLI Command Hardening

## Sprint Theme

**Allow intentional local power, block accidental shell-shaped footguns.**

---

## Overview

Polyphon is explicitly local-first. CLI voices are a product feature: the conductor can point
a voice at any binary installed on their machine and Polyphon runs it as a subprocess. That is
by design and consistent with the project's provider-agnostic principles.

The hardening gap this sprint closes is narrow: two remaining entry points accept a CLI command
string without validating it against the `CLI_COMMAND_RE` rule before subprocess code runs.

1. **`testCliVoice()` in `settingsHandlers.ts`** — the IPC registration wrapper (added in
   Sprint 005) already calls `requireCliCommand` before invoking the function. But the function
   body itself has no guard, so a direct call to `testCliVoice()` — e.g., from a test helper
   or a future refactor that bypasses the IPC layer — reaches `spawnSync` with an unvalidated
   string.

2. **`CLIVoice` constructor** — accepts `cliCommand` from a `VoiceConfig` at object creation
   time without checking the format. `requireCompositionVoiceShape` already validates
   `cliCommand` on the composition IPC path, but construction-time validation provides a
   second layer that fires regardless of how the voice is created.

`validate.ts` already exports `requireCliCommand` with the correct regex
(`/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/`). Both changes are small additions — import and call. No
new utility code, no schema changes, no new dependencies.

---

## Use Cases

1. **Malformed CLI test command is rejected at the function boundary** — `testCliVoice('../../evil')` throws before `spawnSync` is reached, even if called directly (not via IPC).
2. **Misconfigured CLI voice fails at construction time** — `new CopilotVoice({ cliCommand: 'cmd;rm', ... })` throws before the object is created.
3. **Legitimate custom binary still works** — `my-tool.exe`, `node_v20`, and `claude` are valid command names; nothing changes for normal usage.
4. **Threat model stays visible** — future contributors see explicit comments at both call sites explaining this is metacharacter hardening, not a sandbox.
5. **Regression is caught in tests** — provider constructor tests fail if the CLIVoice guard is removed.

---

## Architecture

```
IPC registration (already present, Sprint 005):
  settings:testCliVoice(command)
    ├── requireCliCommand(command, 'command')   ← already wired at line 307
    └── testCliVoice(command as string)

testCliVoice() function body:
    ├── requireCliCommand(command, 'command')   ← NEW: function-level guard
    ├── if POLYPHON_MOCK_VOICES === '1' return mock
    └── spawnSync(command, ['--version'], ...)

CLIVoice constructor:
    ├── const cliCommand = config.cliCommand ?? config.defaultCommand
    ├── requireCliCommand(cliCommand, 'cliCommand')   ← NEW
    └── this.cliCommand = cliCommand

Existing validation layers (not touched):
    requireCompositionVoiceShape()  — composition IPC path
    SETTINGS_SAVE_PROVIDER_CONFIG   — saves provider config
    SETTINGS_TEST_CLI_VOICE handler — IPC registration wrapper
```

`AnthropicCLIVoice` and `CodexVoice` extend `CLIVoice` and inherit the new constructor guard
automatically.

---

## Implementation Plan

### P0: Must Ship

#### 1. `src/main/ipc/settingsHandlers.ts` — function-level guard in `testCliVoice()`

**Files:**
- `src/main/ipc/settingsHandlers.ts`

**Tasks:**
- [ ] `requireCliCommand` is already imported (line 10). Call it as the **first line** of
      `testCliVoice()`, before the `POLYPHON_MOCK_VOICES` branch.
- [ ] Add a threat model comment above the call explaining: CLI voices are intentionally
      user-configured to run local binaries; this validation prevents shell metacharacter
      injection and path traversal — it does not prevent execution of any binary already on
      PATH, which is by design.

#### 2. `src/main/voices/CLIVoice.ts` — construction-time guard

**Files:**
- `src/main/voices/CLIVoice.ts`

**Tasks:**
- [ ] Import `requireCliCommand` from `'../ipc/validate'`
- [ ] Resolve the command first, validate, then assign:
  ```ts
  const cliCommand = config.cliCommand ?? config.defaultCommand;
  // CLI voices are intentionally user-configured to run local binaries. This
  // validation prevents shell metacharacter injection and path traversal —
  // it does not prevent execution of any binary on PATH by name, which is
  // by design and equivalent to the user running the command themselves.
  requireCliCommand(cliCommand, 'cliCommand');
  this.cliCommand = cliCommand;
  ```

#### 3. Unit tests — provider constructor tests

**Files:**
- `src/main/voices/providers/claude-code.test.ts`
- `src/main/voices/providers/copilot.test.ts`

**Tasks:**
- [ ] Add a `describe('constructor validation')` block to each file with:
  - `it('throws for cliCommand with path separator', ...)` — `cliCommand: '../../evil'`
  - `it('throws for cliCommand with shell metacharacter', ...)` — `cliCommand: 'cmd;rm'`
  - `it('throws for empty cliCommand', ...)` — `cliCommand: ''`
  - `it('accepts valid custom cliCommand', ...)` — `cliCommand: 'my-tool.exe'`

#### 4. Direct unit test for `testCliVoice()` body

**Files:**
- A new `describe` block in an existing settings test file, or a focused unit test in
  `src/main/ipc/settingsHandlers.test.ts` (create if absent)

**Tasks:**
- [ ] Test `testCliVoice('../../evil')` throws before `spawnSync` is called
- [ ] Test `testCliVoice('cmd;rm')` throws
- [ ] Test `testCliVoice('')` throws
- [ ] Confirm via spy/mock that `spawnSync` is NOT called when validation fails

**Note:** `settingsHandlers.integration.test.ts` already covers invalid commands via the IPC
handler wrapper (added as part of Sprint 005). This task adds a direct function-body test
that is independent of the IPC registration.

### P1: Ship If Capacity Allows

- [ ] Add one constructor validation test to `src/main/voices/providers/anthropic.test.ts`
      (via the `AnthropicCLIVoice` path, e.g., `create({ ...config, cliCommand: '../../evil' })`)
      and one to `src/main/voices/providers/openai.test.ts` (via `CodexVoice`) to prove the
      base-class guard reaches those providers too.

### Deferred

- **`cliArgs` element validation at construction time** — `spawn` with an argv array does not
  interpret args as shell commands; each arg is passed as-is. The composition IPC path already
  validates `cliArgs` via `requireCompositionVoiceShape`. Low incremental risk.
- **Centralizing threat-model docs** — a future security doc could collect all these
  comments; out of scope for this sprint.

---

## Files Summary

| File | Action | Purpose |
|------|--------|---------|
| `src/main/ipc/settingsHandlers.ts` | Modify | Add `requireCliCommand` call + threat model comment in `testCliVoice()` |
| `src/main/voices/CLIVoice.ts` | Modify | Add `requireCliCommand` import + call in constructor |
| `src/main/voices/providers/claude-code.test.ts` | Modify | Constructor invalid-command tests |
| `src/main/voices/providers/copilot.test.ts` | Modify | Constructor invalid-command tests |
| `src/main/ipc/settingsHandlers.test.ts` | Create or modify | Direct unit test for `testCliVoice()` body |

---

## Definition of Done

**`testCliVoice()` function guard:**
- [ ] `testCliVoice('../../evil')` throws before `spawnSync` is called
- [ ] `testCliVoice('cmd;rm')` throws before `spawnSync` is called
- [ ] `testCliVoice('')` throws before `spawnSync` is called
- [ ] `testCliVoice('claude')` continues to work
- [ ] Validation runs before the `POLYPHON_MOCK_VOICES` early-return branch
- [ ] A threat model comment is present in `testCliVoice()` explaining: metacharacter guard,
      not a PATH restriction, by-design behavior

**`CLIVoice` constructor guard:**
- [ ] `new ClaudeCodeVoice({ cliCommand: '../../evil', ... })` throws
- [ ] `new CopilotVoice({ cliCommand: 'cmd;rm', ... })` throws
- [ ] `new ClaudeCodeVoice({ cliCommand: '', ... })` throws
- [ ] Creating a voice with a valid custom `cliCommand` (e.g. `'my-tool.exe'`) succeeds
- [ ] Creating a voice without `cliCommand` (using the default `'claude'`) succeeds
- [ ] **`defaultCommand` negative test**: constructing a provider with no `cliCommand` and a
      provider-level default that would fail `CLI_COMMAND_RE` (not currently possible with
      built-in providers, but confirmed by the test) — verify the resolved default is validated
- [ ] A threat model comment is present in the `CLIVoice` constructor

**Tests:**
- [ ] `claude-code.test.ts` and `copilot.test.ts` each have ≥3 invalid and 1 valid constructor test
- [ ] Direct `testCliVoice()` unit tests confirm `spawnSync` is NOT called on invalid input
- [ ] Error messages thrown by `requireCliCommand` do not echo the invalid command value
      (they describe the constraint only — confirmed by inspecting thrown error text)
- [ ] All existing unit and integration tests pass unchanged

**Quality:**
- [ ] `make test-unit` passes
- [ ] `make test-integration` passes
- [ ] `npm run typecheck` passes
- [ ] No new npm dependencies

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Validation call placed after mock-voices branch | Low | Low | Call `requireCliCommand` as the first statement in `testCliVoice()`; verified by unit test confirming throws before mock branch |
| `defaultCommand` values fail CLI_COMMAND_RE | Very Low | Medium | `'claude'`, `'copilot'`, `'gemini'`, `'codex'` all match the regex; verified before merge |
| Codex/anthropic CLI providers behave unexpectedly under construction guard | Low | Low | Both extend CLIVoice; guard is the same; P1 tests verify this |
| Sprint 005 integration tests broken by double-validation | Very Low | Low | `requireCliCommand` is idempotent; calling it twice on the same value is safe |

---

## Security Considerations

- **Threat model is explicit and accurate**: validation blocks path separators
  (`../../evil`), shell metacharacters (`cmd;rm`, `tool | cat`), and spaces — it does **not**
  restrict which binaries a user may run by name on their PATH. That power is intentional.
- **`spawnSync` and `spawn` are not shell-invoked**: this is metacharacter hardening to prevent
  confusing well-formed-looking but malformed input, not shell injection prevention per se.
- **Defense in depth**: three existing validation layers (composition shape, save-provider-config
  handler, IPC registration wrapper) are complemented by two new function-level guards.
- **No new attack surface**: no new IPC channels, no new subprocess paths, no schema changes.

---

## Observability & Rollback

**Post-ship verification:**
- `make test-unit` → `claude-code.test.ts` and `copilot.test.ts` pass including new
  constructor tests; direct `testCliVoice()` test passes
- `npm run typecheck` → no type errors after adding import to `CLIVoice.ts`
- Manual smoke: `window.polyphon.settings.testCliVoice('../../evil')` in DevTools →
  renderer receives rejected promise with `"Invalid command: must contain only alphanumeric
  characters, dots, hyphens, or underscores"`

**Rollback:**
Remove the `requireCliCommand` call from `testCliVoice()` and the import + call from
`CLIVoice.ts`. Remove the new constructor tests from provider test files. No schema changes,
no startup changes, no IPC contract changes. Full revert in one commit.

---

## Documentation

- [ ] Threat model comment in `settingsHandlers.ts` `testCliVoice()` (inline)
- [ ] Threat model comment in `CLIVoice.ts` constructor (inline)
- No `CLAUDE.md` update needed — IPC validation convention is already documented from
  Sprint 005; Codex updated the folder structure reference during planning.

---

## Dependencies

- `validate.ts` with `requireCliCommand` — complete (Sprint 005)
- No new npm dependencies
- No schema changes

---

## Devil's Advocate and Security Critiques Addressed

| Critique | Source | Action |
|---|---|---|
| No audit proof that these are the last unguarded subprocess paths | DA | DoD explicitly notes validation runs before `spawnSync`; a grep of all `spawn`/`spawnSync` calls in the codebase confirms the only remaining unguarded command intake is these two sites |
| `defaultCommand` negative test missing | DA | Added DoD item confirming resolved default is validated, not just override `cliCommand` |
| Error messages may echo invalid command value | DA/Security | Added explicit DoD item confirming `requireCliCommand` error format uses field name + constraint only |
| `CLIVoice` importing from `../ipc/validate` is a layering smell | DA | Acknowledged as a known trade-off: `validate.ts` is a pure utility with no side effects; moving it to `shared/` is a future refactor that is out of scope here. Noted in Security Considerations |
| Mock mode should be exempt from validation | DA | Rejected: user explicitly confirmed "always validate" — invalid commands should throw in all environments |
| `CLI_COMMAND_RE` policy may be wrong long-term | DA | Rejected: regex was established and reviewed in Sprint 005; re-evaluating the policy is a separate sprint |
| Provider test coverage of AnthropicCLIVoice/CodexVoice is P1 not P0 | DA | Rejected: base-class guard covers all subclasses by inheritance; 2 representative provider test files is proportionate for P0 |
| All findings | Security | All Low; added error format DoD item as the one actionable change |

---

## Open Questions

None.
