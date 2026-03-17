# Sprint 007: Encryption Hardening — Branded Types, Manifest, and CI Gate

## Sprint Theme

**Make the safe path the easy path, and the unsafe path obvious.**

If a developer touches an encrypted field, TypeScript should guide them toward the correct
crossing points. If someone bypasses those crossing points, CI should catch it before release.

---

## Overview

Sprint 004 shipped field-level AES-256-GCM encryption at the query layer. Every write to a
sensitive column calls `encryptField()`; every read calls `decryptField()`. But nothing in
the type system or CI pipeline would flag a developer who accidentally passes a raw string to
an encrypted column in new code — a plain `db.prepare('INSERT …').run(content)` would pass
TypeScript and all tests, silently storing sensitive data as plaintext.

This sprint adds three complementary guardrails:

**Layer 1 — Branded type**: `EncryptedField = string & { readonly __encrypted: unique symbol }`
in `src/main/db/encryption.ts`. TypeScript makes it a compile error to assign a plain string to
an encrypted `*Row` interface column, or to return an `EncryptedField` value to the domain layer
without decrypting it first. This is a guardrail, not a sandbox — it catches mistakes on typed
paths; raw SQL bypasses are not prevented by types alone.

**Layer 2 — Canonical manifest**: `src/main/db/encryptionManifest.ts` exports `ENCRYPTED_FIELDS`,
the canonical inventory of every table and column that must be encrypted. It is the single
authoritative reference for code review, tests, documentation, and future audits. The manifest
documents intended coverage; the query implementations and tests provide the actual enforcement.

**Layer 3 — CI gate**: `src/main/db/encryption.manifest.test.ts` is a suite of table-specific
integration tests. Each test writes a known sentinel through the query layer, reads the raw
SQLite row directly, asserts the stored value matches `ENC:v1:…` and does not contain the
sentinel, then reads back through the query layer and asserts round-trip correctness. This test
runs in `make test-integration` and fails if any manifest-listed field is stored as plaintext.

**This is a stabilization and formalization sprint.** All three layers are implemented in the
working tree as part of the Sprint 004 effort. The sprint's value is in verifying correctness,
ensuring CLAUDE.md documentation is committed alongside the code, and landing the hardening as
a coherent unit.

---

## Use Cases

1. **Type-safe new field**: A developer adds a new sensitive column and tries to type it as
   `string` in the Row interface. TypeScript flags it when they pass it to `encryptField()`
   (which expects `string`) — but when they pass the return value (an `EncryptedField`) to a
   function expecting a plain `string`, tsc errors. This guides them to use `EncryptedField`
   in the Row interface and `decryptField()` in the row mapper.

2. **CI catches a regression**: A refactor accidentally passes `message.content` directly
   to the DB instead of `encryptField(message.content)`. The manifest test fails in CI with
   a clear assertion failure before the change ships.

3. **Security audit**: An auditor asks "which fields are encrypted?" The answer is
   `ENCRYPTED_FIELDS` in `encryptionManifest.ts` — one file, no guesswork, machine-readable.

4. **Legacy plaintext compatibility**: Old rows written before Sprint 004 lack the `ENC:v1:`
   prefix. `decryptField()` passes them through unchanged. This is an intentional, first-class
   contract: the query layer is backward-compatible with pre-encryption rows.

---

## Architecture

```
Plain string (user / domain layer)
    ↓ encryptField(value: string): EncryptedField
EncryptedField  — stored in *Row interface; written to SQLite
    ↓ decryptField(value: EncryptedField | null): string | null
Plain string (domain layer / IPC response)
```

The TypeScript type system enforces this gate at every call site in the query layer,
on typed paths only. Raw `db.prepare()` outside the query layer bypasses the gate;
the manifest CI test is the runtime enforcement for those cases.

```
src/main/security/fieldEncryption.ts     ← AES-256-GCM; untyped (string in, string out)

src/main/db/encryption.ts               ← NEW: EncryptedField branded type + typed wrappers
  ├── export type EncryptedField = string & { readonly __encrypted: unique symbol }
  ├── export function encryptField(value: string): EncryptedField
  ├── export function decryptField(value: EncryptedField | null): string | null
  └── export { initFieldEncryption, _resetForTests, DECRYPTION_FAILED_SENTINEL }
        from '../security/fieldEncryption'

src/main/db/encryptionManifest.ts        ← NEW: canonical inventory
  └── export const ENCRYPTED_FIELDS = {
        messages:                ['content'],
        user_profile:            ['conductor_name', 'pronouns', 'conductor_context'],
        custom_providers:        ['base_url'],
        system_prompt_templates: ['content'],
        composition_voices:      ['system_prompt', 'cli_args'],
      } as const satisfies Record<string, readonly string[]>

src/main/db/encryption.manifest.test.ts ← NEW: CI gate (table-specific tests)
  ├── messages: insertMessage → raw SELECT → assert ENC:v1: + round-trip
  ├── user_profile: upsertUserProfile → raw SELECT → assert ENC:v1: + round-trip (3 cols)
  ├── custom_providers: createCustomProvider → raw SELECT → assert ENC:v1: + round-trip
  ├── system_prompt_templates: createSystemPromptTemplate → raw SELECT → assert ENC:v1:
  └── composition_voices: insertComposition (requires insertSession first) → raw SELECT → assert ENC:v1: (2 cols)

src/main/db/queries/*.ts
  ├── *Row interfaces: encrypted columns typed as EncryptedField (or EncryptedField | null)
  ├── write helpers: encryptField(plainValue) at the DB boundary
  └── row mappers: decryptField(row.encryptedCol) before returning domain objects
```

---

## Implementation Plan

### P0: Must Ship

All implementation is complete in the working tree. P0 tasks are verification + commit.

#### 1. `src/main/db/encryption.ts` — Branded type

**Tasks:**
- [ ] Confirm `EncryptedField` is defined as `string & { readonly __encrypted: unique symbol }`
- [ ] Confirm `encryptField(value: string): EncryptedField` wraps `../security/fieldEncryption`
- [ ] Confirm `decryptField(value: EncryptedField | null): string | null`
- [ ] Confirm `initFieldEncryption`, `_resetForTests`, `DECRYPTION_FAILED_SENTINEL` are re-exported
- [ ] Verify: `npm run typecheck` (or `npx tsc --noEmit`) passes
- [ ] Verify compile-time enforcement: temporarily assign a `row.content: EncryptedField` to a
  `string` variable in a query file — tsc must error (then revert)

#### 2. `src/main/db/encryptionManifest.ts` — Canonical inventory

**Tasks:**
- [ ] Confirm `ENCRYPTED_FIELDS` covers all five tables with the correct column names
- [ ] Confirm `as const satisfies Record<string, readonly string[]>` — enables type inference
  AND runtime iteration
- [ ] Confirm the manifest matches what is actually encrypted in the five query files (no
  orphan entries, no missing entries)

#### 3. `src/main/db/encryption.manifest.test.ts` — CI gate

**Tasks:**
- [ ] Each table in `ENCRYPTED_FIELDS` has a corresponding `it(…)` block
- [ ] Each `it`: inserts a sentinel through the query layer with `initFieldEncryption(Buffer.alloc(32))`;
  reads the raw row via `db.prepare('SELECT … FROM … WHERE id = ?').get(id)`;
  asserts `row.col.match(/^ENC:v1:/)` and `!row.col.includes(SENTINEL)`
- [ ] Each `it`: reads back through the query layer and asserts the result equals the original
  sentinel (round-trip decryption)
- [ ] `composition_voices` test: inserts a session first (FK requirement), then calls
  `insertComposition` — self-contained, no shared state
- [ ] `make test-integration` passes with this file included
- [ ] One-time negative verification during development: remove `encryptField()` from one
  query function, confirm `make test-integration` fails, then restore

#### 4. Query files — `EncryptedField` in `*Row` interfaces

**Files:** `messages.ts`, `userProfile.ts`, `customProviders.ts`, `systemPromptTemplates.ts`,
`compositions.ts`

**Tasks:**
- [ ] Each file imports `{ encryptField, decryptField, type EncryptedField }` from `'../encryption'`
- [ ] Each encrypted column in `*Row` interface is typed as `EncryptedField` or `EncryptedField | null`
  for nullable columns (e.g. `composition_voices.system_prompt`)
- [ ] `rowToX` functions call `decryptField(row.encryptedCol)` — never pass `EncryptedField` as
  plain string
- [ ] Write functions call `encryptField(plainValue)` before `db.prepare().run()`
- [ ] `cli_args` in `compositions.ts`: `JSON.stringify(cliArgs)` → `encryptField()` on write;
  `decryptField()` → `JSON.parse()` on read (JSON wrapping preserved)
- [ ] `npm run typecheck` passes across all five files

#### 5. `CLAUDE.md` — Encrypted Fields documentation

**Tasks:**
- [ ] Confirm the Encrypted Fields section is present and covers:
  - `EncryptedField` branded type and what it enforces (compile-time guardrail on typed paths)
  - `ENCRYPTED_FIELDS` manifest as canonical inventory
  - Rules for adding new encrypted fields (manifest + EncryptedField in Row interface)
  - Rules for new tables (review columns before writing the query file)
  - Prohibition on bypassing the query layer for encrypted tables
  - Prohibition on sending `EncryptedField` over IPC (always decrypt first)
  - Manifest test as CI gate — must pass; add assertion when adding new encrypted field
- [ ] Confirm the explicit limits of the branded type are noted: it's a guardrail, not a sandbox

### P1: Ship If Capacity Allows

- [ ] Add a `// @encrypted` comment above each `EncryptedField` field in `*Row` interfaces
  as a visual signal for code reviewers (zero runtime cost)
- [ ] Add to the integration tests for query files that already have encryption tests (e.g.
  `messages.integration.test.ts`): a comment noting that the manifest test in
  `encryption.manifest.test.ts` is the authoritative CI gate

### Deferred

- **ESLint rule to prevent raw `db.prepare` on encrypted tables** — CI gate provides
  equivalent coverage without tooling complexity; a future hardening sprint could add this
  for full defense-in-depth against raw SQL bypasses (flagged by devil's advocate)
- **Schema-derived manifest completeness check** — a tool that scans the schema/query layer
  to verify `ENCRYPTED_FIELDS` is complete would eliminate the "manifest omits a field"
  scenario; deferred as tooling investment; code review + CLAUDE.md rules are the current backstop
- **Runtime duplicate-encryption guard** — branded type prevents at compile time; runtime
  guard adds cost without coverage benefit
- **Bulk re-encryption of legacy plaintext rows** — deferred from Sprint 004

---

## Files Summary

| File | Action | Purpose |
|------|--------|---------|
| `src/main/db/encryption.ts` | Verify/commit | Branded type + typed encrypt/decrypt wrappers |
| `src/main/db/encryptionManifest.ts` | Verify/commit | Canonical encrypted-column inventory |
| `src/main/db/encryption.manifest.test.ts` | Verify/commit | CI gate: asserts ciphertext-at-rest + round-trip |
| `src/main/db/queries/messages.ts` | Verify/commit | `EncryptedField` on `content` |
| `src/main/db/queries/userProfile.ts` | Verify/commit | `EncryptedField` on 3 profile columns |
| `src/main/db/queries/customProviders.ts` | Verify/commit | `EncryptedField` on `base_url` |
| `src/main/db/queries/systemPromptTemplates.ts` | Verify/commit | `EncryptedField` on `content` |
| `src/main/db/queries/compositions.ts` | Verify/commit | `EncryptedField` on `system_prompt` + `cli_args` |
| `CLAUDE.md` | Verify/commit | Encrypted Fields section documents manifest, branded type, CI gate |

---

## Definition of Done

**Branded type:**
- [ ] `EncryptedField` is `string & { readonly __encrypted: unique symbol }` in `encryption.ts`
- [ ] `encryptField(value: string): EncryptedField` — only way to produce an `EncryptedField`
- [ ] `decryptField(value: EncryptedField | null): string | null` — requires `EncryptedField` input
- [ ] Assigning a raw `string` to a `*Row` field typed as `EncryptedField` is a tsc error
- [ ] Returning `row.encryptedCol` directly as a plain `string` without `decryptField()` is a tsc error
- [ ] `npm run typecheck` (or `npx tsc --noEmit`) passes

**Manifest:**
- [ ] `ENCRYPTED_FIELDS` covers all five tables with correct column names
- [ ] `as const satisfies Record<string, readonly string[]>` is present
- [ ] Manifest matches actual query-layer implementation (no orphan, no missing entries)

**CI gate test:**
- [ ] One `it(…)` block per table in `ENCRYPTED_FIELDS`
- [ ] Each test: raw SQL read returns value matching `/^ENC:v1:/`; not containing sentinel
- [ ] Each test: query-layer read returns original sentinel (round-trip)
- [ ] `composition_voices` test inserts session first (FK setup)
- [ ] `make test-integration` passes
- [ ] One-time negative test: removing `encryptField()` from a query causes test failure (verified and restored)

**Legacy compatibility (first-class contract):**
- [ ] `decryptField()` returns raw value for inputs that do NOT begin with `ENC:v1:`
- [ ] At least one integration test per modified query file exercises this fallback path
  (raw SQL insert of plaintext → query layer reads it back correctly)

**Query layer:**
- [ ] All five query files use `EncryptedField` in encrypted `*Row` columns
- [ ] All five `rowToX` functions call `decryptField()` on encrypted columns
- [ ] All five INSERT write paths call `encryptField()` before `db.prepare().run()`
- [ ] All UPDATE write paths also call `encryptField()` for encrypted columns
  (`updateCustomProvider` encrypts `base_url`; `upsertUserProfile` encrypts 3 profile fields;
  `updateSystemPromptTemplate` encrypts `content`; `upsertCompositionVoices` encrypts both columns)
- [ ] `compositions.ts` preserves JSON serialize-before-encrypt / decrypt-before-parse for `cli_args`

**Documentation:**
- [ ] `CLAUDE.md` Encrypted Fields section committed and correct
- [ ] Section notes the branded type is a guardrail (typed paths only), not a sandbox

**Regression:**
- [ ] `make test-unit && make test-integration` pass
- [ ] `POLYPHON_E2E=1 make test-e2e` passes unchanged
- [ ] `npm run typecheck` passes

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Raw `db.prepare()` bypass outside query layer — not caught by types | Low | High | CI gate catches runtime bypasses on query-layer paths; CLAUDE.md documents prohibition on raw SQL for encrypted tables |
| `ENCRYPTED_FIELDS` manifest drifts from actual query implementation | Low | High | CI gate tests actual runtime behavior; tsc enforces `EncryptedField` usage in Row interfaces — manifest drift is caught when tests or types fail. **Note:** manifest completeness is convention-backed, not schema-derived; a new sensitive column omitted from the manifest would not be auto-detected |
| Branded type cast away with `as string` | Low | Medium | Guardrail language in CLAUDE.md; convention-based; runtime test is the backstop |
| Nullable handling broken for `system_prompt` (nullable `EncryptedField`) | Low | Medium | Explicit checklist item; compositions integration tests exercise null and non-null paths |
| Sprint appears redundant because code exists in working tree | High | Low | Sprint is explicitly framed as stabilization + formalization; value is in verification and committing as a coherent unit |

---

## Security Considerations

- **No new attack surface**: this sprint adds type annotations, a manifest, and a test. Zero
  new runtime code paths, zero new IPC channels.
- **Defense-in-depth**: three independent layers — TypeScript (compile-time, typed paths),
  manifest test (runtime, query-layer paths), CLAUDE.md (human/review, all paths).
- **EncryptedField is a compile-time guardrail, not a sandbox**: it disappears at runtime
  (`string` at JS level). The security story is "types + conventions + runtime tests," not
  "types alone."
- **Manifest as audit artifact**: `ENCRYPTED_FIELDS` is machine-readable; future security
  tooling, compliance checks, or audits can consume it without parsing TypeScript source.
- **Legacy plaintext is an explicit contract, not a fallback**: `decryptField()` is designed
  to pass through pre-encryption rows transparently. This is documented as intentional behavior.

---

## Observability & Rollback

**Post-ship verification:**
- `make test-integration` → manifest test and all query tests pass
- `npm run typecheck` → no type errors in query files
- `git grep "EncryptedField" src/main/db/queries/` → all five files present

**Rollback:**
Remove `encryption.ts`, `encryptionManifest.ts`, `encryption.manifest.test.ts`. Revert
query files to use `string` in Row interfaces. No schema changes, no runtime behavior
changes, no IPC changes. Encryption continues to work at the `fieldEncryption.ts` level;
only the typed wrappers and manifest are removed.

---

## Documentation

- [ ] `CLAUDE.md` Encrypted Fields section is present, correct, and committed

---

## Dependencies

- **Sprint 004** (At-Rest Database Encryption, completed 2026-03-17) — this sprint builds
  on the query-layer encryption implementation from Sprint 004; no schema changes
- No new npm dependencies

---

## Open Questions

None. All design decisions resolved in Sprint 004 or during sprint planning.

---

## Devil's Advocate and Security Critiques Addressed

| Critique | Source | Action |
|---|---|---|
| "Structurally impossible" overclaims — raw SQL bypasses are possible | Codex critique | Language updated: "compile error on typed paths"; "guardrail, not a sandbox" |
| Manifest test is table-specific, not a generic iterator | Codex critique | Architecture section updated; each table has its own test scenario |
| Sprint framing should explicitly state work is already done | Codex critique | Overview updated: "stabilization and formalization sprint; implementation in working tree" |
| "Single source of truth" implies self-enforcement | Codex critique | Updated to "canonical inventory"; enforcement is by tests + types |
| Legacy plaintext should be a first-class contract | Codex critique | Added explicit DoD item for legacy fallback path |
| Missing `npm run typecheck` in verification | Claude critique | Added to DoD and verification steps |
| Missing `insertSession` FK dependency in manifest test | Claude critique | Noted explicitly in CI gate task checklist |
| `make lint` not confirmed to exist | Claude critique | Removed from verification steps |
| UPDATE write paths not covered by CI gate | DA critique | Added DoD item explicitly naming each UPDATE path that must encrypt; individual query integration tests cover update paths |
| Manifest completeness is convention-backed, not schema-derived | DA critique | Added explicit note to Risks table; added schema-derived manifest check to Deferred |
| "Do not approve" recommendation | DA critique | **Rejected** — Sprint scope is correctly bounded. DA concerns about ESLint rules and schema derivation are appropriately deferred. The branded type's limitations are explicitly acknowledged throughout. Legacy plaintext pass-through is a deliberate Sprint 004 design decision with a documented deferred follow-on (bulk re-encryption) |
| "Branded type has limited security value" | DA critique | **Rejected** — Sprint explicitly states "guardrail, not a sandbox"; this is the correct framing; DA attacks a position we already hold |
| "Manifest is pure duplication" | DA critique | **Rejected** — Cost of raw-SQL architecture without ORM; the manifest's audit value is real and independent of the query files |
| Legacy plaintext is "architectural regret" | DA critique | **Rejected** — Deliberate Sprint 004 decision; bulk migration is properly deferred; the fallback is an intentional compatibility contract |
| All security findings | Security review | All Low; no DoD changes required beyond update-path DoD item |
