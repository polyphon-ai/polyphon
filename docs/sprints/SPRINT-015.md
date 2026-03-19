# Sprint 015: Dead Code Audit and Cleanup

## Sprint Theme

**Make the codebase smaller and truer by removing confirmed-dead production residue, not
by adding speculative tooling or broad refactoring.**

---

## Overview

After 14 sprints of active feature development — encryption, logging, CSP, IPC validation,
provider cleanup — the codebase has accumulated a small number of dead exports and one stale
documentation entry. This sprint formally audits the codebase for unused and orphaned code,
records statistics before and after, and removes the confirmed dead items.

The codebase is healthier than average for its age. The dead code inventory is short: two
unexported production symbols, one test-only export with no production path, and one stale
CLAUDE.md documentation entry. The sprint is intentionally small — removing code that is
truly dead rather than performing speculative refactoring.

**Live runtime path for env loading (NOT changing):**
```
loadShellEnv()
  → command env -0
  → parseNulEnvBlock()
  → applyEnvEntries()
```

**Current residue (confirmed dead):**
```
src/shared/constants.ts
  → PROVIDER_NAMES.GEMINI_CLI (unused constant — no callers anywhere)

src/main/utils/index.ts
  → nowMs() (unused export — zero imports anywhere)

src/main/utils/env.ts
  → parseEnvBlock() (legacy helper — only test files import it; production uses parseNulEnvBlock)

CLAUDE.md
  → build_expiry table listed — does not exist in schema.ts or any migration
```

**Target state:** code and docs describe only what the application actually uses today.

---

## Documentation Scope Policy

This sprint defines two tiers of documentation:

- **Active docs** (CLAUDE.md, README.md, site/): describe current behavior; are updated when
  behavior changes. Sprint 015 WILL update CLAUDE.md.
- **Historical artifacts** (sprint docs, security audit files): append-only records. Existing
  content in security reviews is not edited. However, `docs/security/SECURITY-REVIEW-2026-03-17.md`
  contains a statement that `parseEnvBlock` was "retained for backward compatibility with its
  existing tests." This becomes inaccurate after Sprint 015. The resolution: append a brief
  correction note to the security review (do not edit existing text) noting that `parseEnvBlock`
  was removed in Sprint 015 after the production path was confirmed to be `parseNulEnvBlock` only.

---

## Use Cases

1. **Contributor reads provider constants** — `PROVIDER_NAMES` contains only provider names
   that exist in the actual product model. No `gemini-cli` ghost suggesting there was once a
   separate gemini-cli provider.

2. **Developer imports from `src/main/utils/index.ts`** — they see only `generateId()`, a
   utility with live callers. No leftover timestamp helper with zero callers.

3. **Maintainer reads `env.ts`** — they see only the parser path Polyphon actually uses for
   shell env capture (`env -0` / NUL-delimited). No legacy newline-delimited helper kept
   alive because tests once imported it.

4. **Claude reads CLAUDE.md** — the database schema description matches the real schema and
   migrations. `build_expiry` does not appear in the table list, so future work is not
   planned against a phantom table.

5. **Sprint review asks what changed** — the team has pre- and post-cleanup statistics for
   file count, LOC, and removed symbols. The cleanup is verifiable, not a vague claim.

---

## Architecture

No architectural changes. All changes are deletions in production source files and one
documentation fix.

```
Before:
  src/shared/constants.ts    PROVIDER_NAMES: { ANTHROPIC, OPENAI, GEMINI, COPILOT, OPENAI_COMPAT, GEMINI_CLI }
  src/main/utils/index.ts    exports: generateId(), nowMs()
  src/main/utils/env.ts      exports: parseEnvBlock(), parseNulEnvBlock(), ...
  CLAUDE.md schema list:     ..., user_profile, build_expiry

After:
  src/shared/constants.ts    PROVIDER_NAMES: { ANTHROPIC, OPENAI, GEMINI, COPILOT, OPENAI_COMPAT }
  src/main/utils/index.ts    exports: generateId()
  src/main/utils/env.ts      exports: parseNulEnvBlock(), ...
  CLAUDE.md schema list:     ..., user_profile
```

### Decision: do not keep `parseEnvBlock()` just because tests import it

The sprint goal is to remove dead production exports. `parseEnvBlock()` is a production export
with zero production callers. Keeping it alive solely so unit tests can reference it defeats
that goal. The correct outcome is:

1. Delete the legacy newline-delimited parser
2. Remove the test suite that exercises only the deleted function
3. Confirm the live behavior (env var filtering, key validation, value size cap) remains
   covered by existing `parseNulEnvBlock` tests

No replacement abstraction is needed. The shared filtering logic already lives in
`applyEnvEntries()`, which is covered through the live path tests.

---

## Statistics

_Fill in at implementation time. Use the same commands before and after to ensure the delta
is apples-to-apples._

**Measurement commands:**
```bash
# File count
find src -name "*.ts" -o -name "*.tsx" | wc -l

# Total lines
find src -name "*.ts" -o -name "*.tsx" | xargs wc -l | tail -1
```

| Metric | Before | After | Delta |
|---|---|---|---|
| .ts/.tsx file count | 114 | 114 | 0 |
| Total lines of code | 23,951 | 23,886 | −65 |
| Dead exported symbols removed | — | — | 3 (GEMINI_CLI, nowMs, parseEnvBlock) |
| Stale doc entries removed | — | — | 1 (build_expiry in CLAUDE.md) |

---

## Implementation Plan

### P0: Must Ship

#### Task 0: Record pre-cleanup baseline

Before touching any code, run the measurement commands above and record the values in the
Statistics table.

#### Task 1: Remove `PROVIDER_NAMES.GEMINI_CLI` from `src/shared/constants.ts`

**Removal target:** `GEMINI_CLI: 'gemini-cli',` in the `PROVIDER_NAMES` object.

**Consistency check:** `PROVIDER_NAMES`, `PROVIDER_METADATA`, and `SETTINGS_PROVIDERS` should
continue to describe the same supported set (Anthropic, OpenAI, Gemini, Copilot, OpenAI-compat)
after removal. `GEMINI_CLI` was never in `PROVIDER_METADATA` or `SETTINGS_PROVIDERS`, so no
cascading change is needed.

**Tasks:**
- [ ] Confirm zero callers: `grep -r "GEMINI_CLI" src/` → only the definition line
- [ ] Confirm string value is also unused: `grep -r "'gemini-cli'" src/` → zero hits
- [ ] Delete the `GEMINI_CLI` line
- [ ] Verify `npm run typecheck` passes

#### Task 2: Remove `nowMs()` from `src/main/utils/index.ts`

**Removal target:** The `nowMs()` function and its export.

**Tasks:**
- [ ] Confirm zero imports: `grep -r "nowMs" src/` → only the definition
- [ ] Delete the function
- [ ] Verify `generateId()` is still present and correct
- [ ] Verify `npm run typecheck` passes

#### Task 3: Remove `parseEnvBlock()` from `src/main/utils/env.ts` and migrate tests

**Removal target:** The exported `parseEnvBlock()` function and the test suite covering it.
However, `parseEnvBlock` tests are more comprehensive for edge-case coverage than the
existing `parseNulEnvBlock` tests. Since both parsers share `applyEnvEntries()` for key
filtering and value capping — and `applyEnvEntries()` is not tested directly — the edge-case
test cases must be migrated to `parseNulEnvBlock` before deleting the `parseEnvBlock` suite.

**Coverage matrix that MUST remain after migration** (convert `KEY=value\n` → `KEY=value\0`):

| Test case | Expected outcome |
|---|---|
| Uppercase key, standard value | Written to env; returns true |
| Empty block (`""`) | No writes; returns true |
| Lowercase key (`my_key=value`) | Skipped; logger.debug called with key name; returns true |
| Key with dot (`MY.KEY=value`) | Skipped; logger.debug called; returns true |
| Key with space (`MY KEY=value`) | Skipped; logger.debug called; returns true |
| Empty key (`=value`) | Skipped; returns true |
| No `=` in entry | Skipped; no crash; returns true |
| Value exactly at `ENV_VALUE_MAX_BYTES` | Written; returns true |
| Value over `ENV_VALUE_MAX_BYTES` | Skipped; logger.debug with key name; returns true |
| Multi-`=` value (`KEY=a=b=c`) | Splits on first `=` only; value is `a=b=c`; returns true |
| Empty value (`KEY=`) | Written as empty string; returns true |
| Block exceeds `SHELL_ENV_MAX_LEN` | Zero writes; returns false |

**Tasks:**
- [ ] Confirm no production imports: `grep -r "parseEnvBlock" src/ --include="*.ts" | grep -v "\.test\."` → only definition in `env.ts`
- [ ] Migrate all edge-case tests from `describe('parseEnvBlock', ...)` to `describe('parseNulEnvBlock', ...)`, converting newline-delimited input to NUL-delimited (`\0`)
- [ ] Update any `parseNulEnvBlock` test descriptions that reference "same key filter as parseEnvBlock" or "same value length cap as parseEnvBlock" — remove the parseEnvBlock reference
- [ ] Remove the `describe('parseEnvBlock', ...)` block from `env.test.ts`
- [ ] Remove `parseEnvBlock` from the import list in `env.test.ts`
- [ ] Remove `parseEnvBlock()` from `env.ts`
- [ ] Remove the comment in `env.ts` that cross-references `parseEnvBlock` (text like "the same key/value filters as parseEnvBlock")
- [ ] Verify `npm run typecheck` passes
- [ ] Verify `make test-unit` passes — all migrated cases must pass under `parseNulEnvBlock`

#### Task 4: Remove `build_expiry` from CLAUDE.md

**Removal target:** `build_expiry` in the comma-delimited schema table list.

**Tasks:**
- [ ] Locate the tables list in the Database section (search for "build_expiry")
- [ ] Remove `build_expiry` from the list
- [ ] Verify the list now ends: `..., system_prompt_templates, user_profile`
- [ ] Run a broader scan to confirm no other `build_expiry` references in CLAUDE.md

#### Task 4b: Append correction note to `docs/security/SECURITY-REVIEW-2026-03-17.md`

The security review document is an append-only historical artifact. It currently states that
`parseEnvBlock` was "retained for backward compatibility with its existing tests." This
becomes inaccurate after Sprint 015. Per the Documentation Scope Policy, the existing text
is not edited. Instead, append a correction note at the end of the file.

**Tasks:**
- [ ] Append to `docs/security/SECURITY-REVIEW-2026-03-17.md` (do not edit existing text):
  ```
  ---
  **Sprint 015 update (2026-03-19):** `parseEnvBlock()` was removed. The production env-loading
  path was always `parseNulEnvBlock()` exclusively. The edge-case test coverage previously
  anchored to `parseEnvBlock` was migrated to the `parseNulEnvBlock` test suite.
  ```

#### Task 5: Record post-cleanup statistics

Re-run the measurement commands from Task 0 and fill in the After column of the Statistics
table. Document the delta.

**Final verification grep (repo-wide, not just `src/`):**
```bash
grep -r "GEMINI_CLI" . --include="*.ts" --include="*.tsx" --include="*.json" --include="*.yaml" --include="*.yml" --include="*.sh" --exclude-dir=".git" --exclude-dir="node_modules"
# → zero hits

grep -r "nowMs" . --include="*.ts" --include="*.tsx" --exclude-dir=".git" --exclude-dir="node_modules"
# → zero hits

grep -r "parseEnvBlock" . --include="*.ts" --include="*.tsx" --exclude-dir=".git" --exclude-dir="node_modules"
# → zero hits (the security review .md hit is acceptable — see Documentation Scope Policy)

grep "build_expiry" CLAUDE.md
# → zero hits
```

#### Task 6: Run the full test suite

- [ ] `npm run typecheck` — must pass
- [ ] `make test-unit` — must pass (env tests, logger tests, etc.)
- [ ] `make test-integration` — must pass

### P1: Ship If Capacity Allows

#### Automated dead-export detection tooling evaluation

The sprint confirmed that TypeScript's `strict` mode does not catch unused exports. Evaluate
and add one of the following, whichever can be configured cleanly without widespread
`// eslint-disable` suppressions:

**Option A — `ts-prune` (CLI tool, zero runtime dep):**
```bash
npm view ts-prune version
```
Add as a dev dependency; add a Makefile target `make check-unused-exports`. Known issue:
false positives on re-exports and type-only exports. If more than 3-5 false positives
require suppression comments, defer to a separate sprint.

**Option B — `eslint-plugin-unused-imports` (ESLint plugin):**
If ESLint is already in the project, add the plugin and enable `no-unused-vars` with
appropriate configuration for test files. Less noisy than `ts-prune` for this codebase's
patterns.

**Decision gate:** if either option produces more than 3-5 suppressions needed for legitimate
patterns (test helpers exported for mocking, type re-exports), skip and log as a future sprint.

**Do NOT add `noUnusedLocals`/`noUnusedParameters` to `tsconfig.json`** — these options
detect local variables and parameters, not exported symbols. They would not have caught any
of the dead code found in this sprint.

### Deferred

- **Broad speculative cleanup** — the codebase is clean; no further dead items were found
  during orientation that met the "confirmed, no production caller" bar
- **Security review doc update** — `docs/security/SECURITY-REVIEW-2026-03-17.md` has a note
  that `parseEnvBlock` was retained; this is a historical artifact and is not updated
- **Refactoring utility modules** — no refactoring in scope; deletions only

---

## Files Summary

| File | Action | Purpose |
|------|--------|---------|
| `src/shared/constants.ts` | Modify | Remove `PROVIDER_NAMES.GEMINI_CLI` |
| `src/main/utils/index.ts` | Modify | Remove `nowMs()` export |
| `src/main/utils/env.ts` | Modify | Remove `parseEnvBlock()` function |
| `src/main/utils/env.test.ts` | Modify | Migrate edge-case tests to `parseNulEnvBlock`; remove `parseEnvBlock` import and test block |
| `CLAUDE.md` | Modify | Remove `build_expiry` from schema table list |
| `docs/security/SECURITY-REVIEW-2026-03-17.md` | Append | Add correction note: `parseEnvBlock` removed in Sprint 015 |

---

## Definition of Done

**Dead code removed (repo-wide verification):**
- [ ] `grep -r "GEMINI_CLI" . --include="*.ts" --include="*.tsx" --include="*.json" --include="*.yml" --exclude-dir=".git" --exclude-dir="node_modules"` → zero hits
- [ ] `grep -r "nowMs" . --include="*.ts" --include="*.tsx" --exclude-dir=".git" --exclude-dir="node_modules"` → zero hits
- [ ] `grep -r "parseEnvBlock" . --include="*.ts" --include="*.tsx" --exclude-dir=".git" --exclude-dir="node_modules"` → zero hits
- [ ] `grep "build_expiry" CLAUDE.md` → zero hits

**Consistency:**
- [ ] `PROVIDER_NAMES`, `PROVIDER_METADATA`, and `SETTINGS_PROVIDERS` remain consistent
  (all describe the same 5-provider set: anthropic, openai, gemini, copilot, openai-compat)
- [ ] `generateId()` still present and used in `src/main/managers/SessionManager.ts` and `src/main/ipc/index.ts`

**Env parsing coverage matrix complete** (verify these test cases exist in `parseNulEnvBlock` suite):
- [ ] Uppercase key accepted
- [ ] Lowercase key rejected (logger.debug called)
- [ ] Key with dot rejected
- [ ] Key with space rejected
- [ ] Empty key (= prefix) rejected
- [ ] No `=` in entry — skipped
- [ ] Value exactly at `ENV_VALUE_MAX_BYTES` — accepted
- [ ] Value over `ENV_VALUE_MAX_BYTES` — rejected (logger.debug called)
- [ ] Multi-`=` value splits on first `=` only
- [ ] Empty value written as empty string
- [ ] Block exceeding `SHELL_ENV_MAX_LEN` — returns false, zero writes

**TypeScript and tests:**
- [ ] `npm run typecheck` passes
- [ ] `make test-unit` passes
- [ ] `make test-integration` passes

**Statistics:**
- [ ] Statistics table complete (Before, After, Delta columns all filled in)
- [ ] Delta is accurate (calculated from actual measurement, not planning estimates)

**Documentation:**
- [ ] CLAUDE.md schema table list no longer contains `build_expiry`
- [ ] CLAUDE.md schema list matches `src/main/db/schema.ts` actual tables
- [ ] Correction note appended to `docs/security/SECURITY-REVIEW-2026-03-17.md`

**Scope:**
- [ ] No new files created
- [ ] No schema changes
- [ ] No IPC changes
- [ ] No new production dependencies (P1 dev dep only if P1 is implemented)

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| `parseEnvBlock` used in a file we missed | Very Low | Low | TypeScript compiler will error at the import site — type safety is the safety net |
| `GEMINI_CLI` string value `'gemini-cli'` used in a string comparison | Very Low | Low | Grep for `'gemini-cli'` before deleting; DoD requires this check |
| `parseNulEnvBlock` test coverage drops after parseEnvBlock tests removed | Low | Low | Explicit DoD item: confirm coverage for key validation, value cap, block cap |
| Security review doc confusion | Certain | None | Explicitly declared as historical artifact; no update needed |
| Delta is smaller than expected | Certain | None | Expected — the codebase is clean; the sprint value is in confirming that with evidence |

---

## Security Considerations

All changes are deletions. No new attack surface is introduced:

- `parseEnvBlock()` removal does not affect the production env parsing path —
  `parseNulEnvBlock()` and `loadShellEnv()` are unchanged
- `PROVIDER_NAMES.GEMINI_CLI` removal does not affect the provider registry, API key
  handling, or provider initialization paths
- `nowMs()` removal does not affect any runtime behavior
- No encryption, IPC, CSP, or authentication paths are modified

---

## Observability & Rollback

**Post-ship verification:**
```bash
grep -r "GEMINI_CLI\|nowMs\|parseEnvBlock" src/ --include="*.ts"
# → zero hits

grep "build_expiry" CLAUDE.md
# → zero hits

make test-unit && make test-integration
npm run typecheck
```

**Rollback:** Revert the 5 file edits (`constants.ts`, `utils/index.ts`, `env.ts`,
`env.test.ts`, `CLAUDE.md`). No schema changes, no migration changes, no IPC changes.
Full revert in one commit.

---

## Documentation

- CLAUDE.md: `build_expiry` removed from schema table list (Task 4)
- No new CLAUDE.md conventions needed — this sprint removes code, not patterns

---

## Dependencies

None. No new packages. No sprint dependencies.

---

## Devil's Advocate and Security Critiques Addressed

| Critique | Source | Action |
|---|---|---|
| Grep in `src/` only — doesn't prove no dynamic or non-src consumers | DA | **Accepted** — verification commands now repo-wide with explicit exclude dirs; TypeScript compiler remains the primary safety net for typed references |
| `parseEnvBlock` test suite covers more edge cases than `parseNulEnvBlock` suite; deleting it loses coverage | DA | **Accepted** — Task 3 now requires migrating the full coverage matrix to `parseNulEnvBlock` tests before deleting; DoD enumerates 11 specific cases |
| Security review contains a now-false statement about `parseEnvBlock`; calling it "harmless" is not credible | DA | **Accepted** — Task 4b added: append a correction note to the security review doc (append-only; existing text not edited) |
| P1 tooling contradicts "No new packages" in Dependencies section | DA | **Accepted** — Dependencies section now reads "No new production dependencies; P1 dev dep only if P1 is implemented" |
| "No architectural changes" is rhetorical — deleting `parseEnvBlock` is a design decision | DA | **Partially accepted** — reframed as "all changes are deletions in production source files" rather than claiming no design consequence. The Decision section remains and defends the choice explicitly. |
| Provider drift has no structural protection; removing one ghost constant doesn't fix the class of problem | DA | **Acknowledged, rejected for this sprint** — enforcing consistency between PROVIDER_NAMES, PROVIDER_METADATA, SETTINGS_PROVIDERS is a separate structural sprint. This sprint removes the one confirmed-dead entry; deferred per Simplest Viable Filter. |
| DoD success criteria are "syntax-level" (zero grep + tests pass) | DA | **Partially accepted** — DoD now includes explicit env coverage matrix and repo-wide search. Structural intent verification (provider consistency) remains a manual check; adding a coded invariant is out of scope for a deletion sprint. |
| LOC statistics are noisy for small changes | DA | **Acknowledged** — statistics table is intentionally low-ceremony; the value is in confirming the codebase is clean, not in precise LOC accounting. Table kept as evidence, not as a quality bar. |
| `env.ts` removal of `parseEnvBlock` may "over-couple tests to NUL transport format" | DA | **Rejected** — the existing `parseNulEnvBlock` tests already use string fixtures with `\0` which are readable. Task 3 migrates edge-case tests in the same format. There is no design regression. |
| Env parsing coverage: SEC-01 finding | Security | **Accepted** — explicit coverage matrix in DoD addresses this |
| P1 dependency should follow Dependency Policy | Security | **Accepted** — P1 section now includes `npm view <package> version` requirement |

---

## Open Questions

None.
