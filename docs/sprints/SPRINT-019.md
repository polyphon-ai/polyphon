# Sprint 019: SQLCipher Whole-Database Encryption

## Overview

Polyphon's current database layer uses field-level AES-256-GCM encryption: a canonical manifest
declares which columns contain sensitive data, branded `EncryptedField` types enforce
encrypt/decrypt at the query boundary, and a CI gate test verifies no plaintext leaks. This
works, but has real costs: composition names, session names, and voice display names remain
plaintext on disk; the manifest requires active maintenance as the schema grows; FTS5 full-text
search is blocked (can't query ciphertext); and every query that touches an encrypted column
must explicitly call `encryptField`/`decryptField`.

This sprint replaces that entire subsystem with SQLCipher whole-database encryption using
`better-sqlite3-sqlcipher`. SQLCipher encrypts every page of the database file — schema,
indexes, metadata, and content alike — using AES-256. From the application's perspective, the
change is narrow: the existing `keyManager.ts` (scrypt KDF, password wrapping, key file format,
unlock window) is untouched; the derived 32-byte key is handed to SQLCipher via a single
`PRAGMA key` call immediately after opening the database. The synchronous query API is
essentially identical to `node:sqlite`'s `DatabaseSync`. The renderer, IPC contracts, and
higher-level managers remain unaware of the change.

The sprint removes the field-encryption infrastructure that becomes obsolete: delete
`fieldEncryption.ts`, `encryption.ts`, `encryptionManifest.ts`, and associated tests; strip all
`encryptField`/`decryptField` call sites and `EncryptedField` typed columns from the eight query
files; fix `logger.ts` which currently derives its sensitive-key redaction set from the manifest;
and update the startup path in `src/main/index.ts` where `initFieldEncryption(key)` is called
before `getDb()`. The build and CI pipeline gains an `electron-rebuild` step with a cached
`.node` binary.

## Use Cases

1. **All data at rest is encrypted:** An attacker with filesystem access (stolen laptop, backup
   app) cannot read any Polyphon data — composition names, session history, conductor profile,
   system prompts, API base URLs — without the encryption key.
2. **No field manifest required:** Adding a new table or column with user data requires no
   manifest update. Encryption is a property of the database file.
3. **FTS5 full-text search is unblocked:** SQLite FTS5 virtual tables work normally on a
   SQLCipher database. A future sprint can add full-text search without any architectural change.
4. **Password-protected key preserves existing UX:** Users who have set a passphrase continue to
   see the unlock window at launch; the password-wrapped key path is unchanged.

## Architecture

```
loadOrCreateKey(userDataPath)
  └── returns { key: Buffer, keyWasAbsent: bool, ... }   ← unchanged

getDb(keyHex: string)
  ├── [first launch after upgrade] sentinel absent?
  │     └── delete polyphon.db / .db-wal / .db-shm; write sqlcipher-migrated-v1 sentinel
  ├── new Database(dbPath)                               ← better-sqlite3-sqlcipher
  ├── PRAGMA key = "x'<64-char-hex>'"                   ← first operation
  ├── PRAGMA kdf_iter = 1                                ← skip SQLCipher's internal KDF
  ├── SELECT count(*) FROM sqlite_master                 ← sanity query; surfaces wrong-key early
  ├── PRAGMA journal_mode = WAL
  └── runMigrations(db)

src/main/db/queries/*.ts
  └── plain string columns — no encryptField/decryptField
      same prepare/run/get/all synchronous API

src/main/utils/logger.ts
  └── SENSITIVE_LOG_KEYS: explicit static allowlist
      (no longer coupled to encryptionManifest.ts)
```

**Key pragma sequence (order is mandatory):**
1. `PRAGMA key = "x'<32-byte-hex>'"` — must be the first statement after open
2. `PRAGMA kdf_iter = 1` — bypasses SQLCipher's PBKDF2; key derivation is done externally by
   scrypt in keyManager.ts; must come before any table access
3. Sanity query: `SELECT count(*) FROM sqlite_master` — forces page read; wrong-key errors
   surface here rather than silently later
4. `PRAGMA journal_mode = WAL`
5. `runMigrations(db)`

**keyHex handoff:** `key.toString('hex')` computed in `src/main/index.ts` after
`loadOrCreateKey()`; passed to `getDb(keyHex)`. No intermediate storage.

**One-time legacy DB reset (sentinel approach):**
- Before opening the database, check for sentinel file `sqlcipher-migrated-v1` in userData
- If sentinel is absent AND `polyphon.db` exists: read the first 16 bytes of the file
  - If they match the SQLite plaintext magic (`SQLite format 3\x00`) → plaintext legacy DB;
    delete `polyphon.db`, `polyphon.db-wal`, `polyphon.db-shm`; write sentinel; log warning
  - If they do not match (encrypted ciphertext) → an encrypted DB is present without a sentinel
    (e.g. sentinel was lost/deleted); do NOT delete; fail loudly with a clear error message
- If sentinel is absent AND no DB file exists: write sentinel; proceed with fresh initialization
- If sentinel is present: open normally (all subsequent launches)
- Wrong-key on an existing encrypted DB: fail loudly, preserve the file — do NOT delete

**keyHex validation:**
Before constructing the `PRAGMA key` statement, assert `keyHex` matches `/^[0-9a-f]{64}$/`.
Throw an explicit error if not — covers empty string, wrong length, non-hex content, and any
case where key derivation failed silently. This guards the string interpolation surface.

**In-memory databases (integration tests):**
`better-sqlite3-sqlcipher` supports `:memory:` with a key applied. The same pragma sequence is
used. Integration tests continue to use `new Database(':memory:')` with PRAGMA key. Validate
this works as a P0 gate before broad cleanup.

## Implementation Plan

### P0: Must Ship

#### Gate Task (do first, before broad cleanup)
- [ ] Install `better-sqlite3-sqlcipher@5.4.3-3` locally; run `npx electron-rebuild`; verify
  the addon compiles against Electron 41 on macOS arm64
- [ ] Confirm the SQLCipher version bundled in `5.4.3-3` is SQLCipher 4.x (not 3.x) — check
  build output or SQLCipher headers; document in sprint finalization notes
- [ ] Write a minimal spike test: open an in-memory Database, apply PRAGMA key + kdf_iter=1,
  insert and retrieve a row — confirm round-trip works in Vitest
- [ ] If any gate fails, stop and reassess before proceeding

#### 1. Replace DB driver and bootstrap path

**Files:**
- `src/main/db/index.ts`
- `src/main/index.ts`

**Tasks:**
- [ ] Replace `import { DatabaseSync } from 'node:sqlite'` with `import Database from
  'better-sqlite3-sqlcipher'`
- [ ] Change `getDb()` signature to accept `keyHex: string`
- [ ] Validate `keyHex` matches `/^[0-9a-f]{64}$/` before constructing the PRAGMA key statement;
  throw an explicit error if not (guards against empty string, wrong length, non-hex content)
- [ ] Implement sentinel-based one-time legacy DB reset with header probe before deletion:
  read first 16 bytes of `polyphon.db` before deleting; delete only if SQLite plaintext magic
  matches; if bytes don't match (encrypted DB without sentinel), fail loudly, preserve the file
- [ ] Apply pragma sequence: validate `keyHex` → open DB → `PRAGMA key` → `PRAGMA kdf_iter = 1`
  → `SELECT count(*) FROM sqlite_master` → `PRAGMA journal_mode = WAL`
- [ ] `runMigrations(db)` after pragma sequence
- [ ] Remove `initFieldEncryption(key)` call from `src/main/index.ts`
- [ ] Compute `keyHex = key.toString('hex')` in `src/main/index.ts`; pass to `getDb(keyHex)`
- [ ] Audit and update ALL `DatabaseSync` type references — this includes IPC handlers, managers,
  migration files (002–010), `updateChecker.ts`, and all integration test files — replace with
  `Database` from `better-sqlite3-sqlcipher` (the grep DoD gate is the authoritative scope check)

#### 2. Delete field-encryption infrastructure

**Files to delete (verify each exists before deleting):**
- `src/main/security/fieldEncryption.ts`
- `src/main/security/fieldEncryption.test.ts`
- `src/main/db/encryption.ts`
- `src/main/db/encryptionManifest.ts`
- `src/main/db/encryption.manifest.test.ts` (or `encryption.manifest.integration.test.ts`)

**Tasks:**
- [ ] Delete all files listed above
- [ ] Remove all imports of `encryptField`, `decryptField`, `EncryptedField`, and
  `encryptionManifest` from every file (grep gate: zero hits required)

#### 3. Fix logger.ts sensitive-key redaction

**Files:**
- `src/main/utils/logger.ts`

**Tasks:**
- [ ] Replace manifest-derived `SENSITIVE_LOG_KEYS` / `SENSITIVE_FIELDS` with an explicit
  static allowlist covering:
  - credential-style keys: `apiKey`, `authorization`, `x-api-key`, `token`, `secret`
  - DB key fields: `key`, `dbKey`, `wrappedKey`, `ciphertext`, `authTag`, `salt`, `iv`, `keyHex`
  - any user-secret payload keys currently redacted
- [ ] Remove any `ENC:v1:` ciphertext-pattern sanitization that assumes field-encryption blobs
- [ ] Preserve API-key redaction and recursive log sanitization behavior
- [ ] Add a logger test: when `getDb` is called and the bootstrap path throws, assert that log
  output does not contain any substring matching the test `keyHex` value
- [ ] Update logger unit tests accordingly

#### 4. Strip query-layer encrypt/decrypt from all query files

**Files:**
- `src/main/db/queries/compositions.ts`
- `src/main/db/queries/messages.ts`
- `src/main/db/queries/sessions.ts`
- `src/main/db/queries/customProviders.ts`
- `src/main/db/queries/tones.ts`
- `src/main/db/queries/systemPromptTemplates.ts`
- `src/main/db/queries/userProfile.ts`
- `src/main/db/queries/providerConfigs.ts` (audit — likely no-op)

**Tasks:**
- [ ] Remove all `encryptField`/`decryptField` calls and `EncryptedField` type usage
- [ ] Update `*Row` interfaces: encrypted columns become plain `string` / `string | null`
- [ ] Return and write row values directly (no encrypt/decrypt wrappers)
- [ ] Preserve existing JSON serialization where it exists (`cli_args`, `metadata`,
  `enabled_tools`)
- [ ] Re-check nullability carefully — removing decrypt helpers must not change
  `null`/`undefined` behavior in returned domain objects

#### 5. Update schema and migrations

**Files:**
- `src/main/db/schema.ts`
- `src/main/db/migrations/index.ts`
- `src/main/db/migrations/011_sqlcipher_transition.ts` (new)

**Tasks:**
- [ ] Bump `SCHEMA_VERSION` from `10` to `11` in `schema.ts`
- [ ] Remove field-encryption comments from column definitions in `CREATE_TABLES_SQL`
- [ ] Create `011_sqlcipher_transition.ts` with a minimal `up()` that is effectively a no-op
  DDL but records the SQLCipher transition era with a comment
- [ ] Register migration 011 in `migrations/index.ts`
- [ ] Audit every numbered migration file (002–010) for `encryptField` calls in their `up()`
  bodies; remove or replace with plain string values (these files import the field-encryption
  module and will fail to compile once that module is deleted)
  - Example: `insertTone.run(id, name, encryptField(description), ...)` →
    `insertTone.run(id, name, description, ...)`
- [ ] Replace encrypted seed inserts for tone descriptions and sample prompt template content
  in `migrations/index.ts` with plain string inserts
- [ ] Remove `node:sqlite` type imports; use `better-sqlite3-sqlcipher` Database type

#### 6. Add SQLCipher integration tests

**Files:**
- `src/main/db/sqlcipher.test.ts` (new integration test)

**Tasks:**
- [ ] Test: key application succeeds on fresh in-memory DB; round-trip insert/retrieve works
- [ ] Test: wrong key → sanity query throws a recognizable error (not silent corruption)
- [ ] Test: no key applied → first query throws before any data access
- [ ] Test: invalid `keyHex` (empty string, wrong length, non-hex) → explicit error before PRAGMA
- [ ] Test (file-backed): write known plaintext via query layer; close DB; reopen with correct key
  and verify data readable; reopen with wrong key and verify error; read raw bytes and assert
  plaintext string is absent from both `polyphon.db` and `polyphon.db-wal` if present
- [ ] Test: sentinel absent + plaintext DB present → DB files deleted, sentinel written,
  subsequent launch does not delete
- [ ] Test: sentinel absent + encrypted DB present (header probe fails plaintext magic check) →
  DB preserved, error thrown — do NOT delete the file (critical safety test)
- [ ] Test: sentinel absent + no DB file → sentinel written, fresh initialization proceeds
- [ ] Test: sentinel present → DB is never deleted regardless of file contents
- [ ] Test: round-trip for each major entity type with representative edge values:
  `null` fields, empty strings, unicode, large text, JSON-serialized arrays/objects
  (composition, session, message, user profile, tone, custom provider, system prompt template)
- [ ] Test: all tests use the real `getDb(keyHex)` bootstrap path, not direct SQLCipher API

#### 7. Update integration tests that depend on field encryption

**Tasks:**
- [ ] Find all integration tests that call `initFieldEncryption()` before using in-memory DBs
  (grep: `initFieldEncryption`)
- [ ] Remove those calls — SQLCipher handles encryption; tests now pass `keyHex` to the DB
  open function
- [ ] Update any integration tests that assert ciphertext behavior

#### 8. Build/CI — native addon support

**Files:**
- `package.json`
- `Makefile`
- `.github/workflows/release.yml`

**Tasks:**
- [ ] Add `better-sqlite3-sqlcipher@5.4.3-3` to `dependencies` in `package.json`
- [ ] Add `electron-rebuild` to `devDependencies` if not already present
- [ ] Update `make install` target: run `npm install` then `npx electron-rebuild`
- [ ] Update `.github/workflows/release.yml`: add `actions/cache` step for the `.node` binary
  (cache key: `${{ runner.os }}-${{ runner.arch }}-native-${{ hashFiles('package-lock.json') }}`)
  before `npm ci`; add `npx electron-rebuild` step after `npm ci`
- [ ] Audit `forge.config.ts` for a `rebuildConfig` or `packagerConfig.hooks` section for native
  addon packaging; if absent, add it — a missing rebuildConfig means the packaged DMG will fail
  to load the `.node` binary at runtime regardless of whether local dev builds work
- [ ] Verify: packaged app (DMG) launches on macOS arm64, loads the native addon, opens the
  encrypted DB, and performs a basic query without error (run before declaring sprint complete)

#### 9. Update documentation

**Files:**
- `CLAUDE.md`

**Tasks:**
- [ ] Update Tech Stack table: Database row → `better-sqlite3-sqlcipher (SQLCipher AES-256)`
- [ ] Update Database section: replace `node:sqlite`/`DatabaseSync` references
- [ ] Simplify Encrypted Fields section: remove manifest table, `EncryptedField` branded type
  description, and CI gate description; replace with: "All data is encrypted at the SQLCipher
  database level. No field-level manifest or branded types are used."
- [ ] Remove `encryption.manifest.test.ts` from any CLAUDE.md references

### P1: Ship If Capacity Allows

- [ ] Audit `forge.config.ts` for an existing `rebuildConfig` section; if absent, verify that
  the Makefile `electron-rebuild` step is sufficient for packaged DMG builds (not just dev runs)
- [ ] Add a comment in the Makefile `install` target explaining why `electron-rebuild` is
  needed (native addon, Electron Node version mismatch if skipped)
- [ ] Add a `make verify-sqlcipher` developer convenience target: open a temp DB, insert a known
  string, hex-dump the file, assert no plaintext — useful for spot-checking after package updates
- [ ] Record packaged app size delta (before vs after native addon) in sprint finalization notes

### Deferred

- **FTS5 full-text search** — this sprint unblocks it; implementation is a separate sprint
- **Windows/Linux builds** — out of scope; only macOS arm64 targeted currently
- **DB type abstraction layer** — not warranted; CLAUDE.md principle: avoid over-engineering

## Files Summary

| File | Action | Purpose |
|---|---|---|
| `src/main/security/fieldEncryption.ts` | Delete | Replaced by SQLCipher |
| `src/main/security/fieldEncryption.test.ts` | Delete | Tests for deleted module |
| `src/main/db/encryption.ts` | Delete | Field-cipher implementation |
| `src/main/db/encryptionManifest.ts` | Delete | No longer needed |
| `src/main/db/encryption.manifest.test.ts` | Delete | CI gate for deleted system |
| `src/main/db/sqlcipher.test.ts` | Create | Integration tests for SQLCipher |
| `src/main/db/migrations/011_sqlcipher_transition.ts` | Create | Migration version marker |
| `src/main/db/index.ts` | Modify | New driver + pragma sequence + sentinel + header probe |
| `src/main/index.ts` | Modify | Remove initFieldEncryption; compute keyHex |
| `src/main/utils/logger.ts` | Modify | Replace manifest-derived redaction; add keyHex to allowlist |
| `src/main/db/schema.ts` | Modify | SCHEMA_VERSION → 11; remove encryption comments |
| `src/main/db/migrations/index.ts` | Modify | Register 011; plain-string seed inserts |
| `src/main/db/migrations/002_*.ts` through `010_*.ts` | Modify | Audit and remove encryptField calls |
| `src/main/ipc/index.ts` | Modify | Replace DatabaseSync type |
| `src/main/ipc/settingsHandlers.ts` | Modify | Replace DatabaseSync type |
| `src/main/utils/updateChecker.ts` | Modify | Replace DatabaseSync type |
| `forge.config.ts` | Modify | Add rebuildConfig for native addon packaging |
| `src/main/db/queries/compositions.ts` | Modify | Strip field encryption |
| `src/main/db/queries/messages.ts` | Modify | Strip field encryption |
| `src/main/db/queries/sessions.ts` | Modify | Strip field encryption |
| `src/main/db/queries/customProviders.ts` | Modify | Strip field encryption |
| `src/main/db/queries/tones.ts` | Modify | Strip field encryption |
| `src/main/db/queries/systemPromptTemplates.ts` | Modify | Strip field encryption |
| `src/main/db/queries/userProfile.ts` | Modify | Strip field encryption |
| `src/main/db/queries/providerConfigs.ts` | Modify | Audit/cleanup |
| `package.json` | Modify | Add better-sqlite3-sqlcipher; electron-rebuild |
| `Makefile` | Modify | electron-rebuild in install target |
| `.github/workflows/release.yml` | Modify | Cache + electron-rebuild steps |
| `CLAUDE.md` | Modify | Update DB section and Encrypted Fields section |

## Definition of Done

**Build and installation:**
- [ ] `better-sqlite3-sqlcipher@5.4.3-3` in `dependencies`; addon compiles via `electron-rebuild`
- [ ] SQLCipher version bundled confirmed as SQLCipher 4.x; documented in sprint notes
- [ ] Gate spike passed: in-memory DB + PRAGMA key round-trips correctly in Vitest
- [ ] Makefile `install` target runs `electron-rebuild` after npm install
- [ ] CI release workflow has `actions/cache` for `.node` binary and runs `electron-rebuild`
- [ ] `forge.config.ts` has `rebuildConfig` for native addon packaging
- [ ] **Packaged DMG launches on macOS arm64; loads native addon; opens encrypted DB without error**

**Cleanup (grep gates):**
- [ ] All deleted files confirmed gone: `fieldEncryption.ts`, `fieldEncryption.test.ts`,
  `encryption.ts`, `encryptionManifest.ts`, `encryption.manifest.test.ts`
- [ ] `grep -r encryptField src/` → zero hits in non-deleted files
- [ ] `grep -r decryptField src/` → zero hits in non-deleted files
- [ ] `grep -r EncryptedField src/` → zero hits in non-deleted files
- [ ] `grep -r encryptionManifest src/` → zero hits in non-deleted files
- [ ] `grep -r initFieldEncryption src/ e2e/` → zero hits
- [ ] `grep -r DatabaseSync src/` → zero hits (replaced with better-sqlite3-sqlcipher Database)
- [ ] `grep -r encryptField src/main/db/migrations/` → zero hits (migration files audited)

**Correctness:**
- [ ] `keyHex` regex validation (`/^[0-9a-f]{64}$/`) in `getDb()` before PRAGMA construction
- [ ] Sentinel + header-probe logic: encrypted DB without sentinel → error, file preserved (not deleted)
- [ ] `sqlcipher.test.ts` passes and covers all of: correct-key open, wrong-key failure, no-key
  failure, invalid-keyHex rejection, raw-file plaintext assertion (including WAL), sentinel logic
  (all 4 cases), encrypted-DB-without-sentinel safety, round-trip for all major entity types with
  null/empty/unicode/JSON edge values — all tests use the real `getDb(keyHex)` bootstrap path
- [ ] `logger.ts` updated: no manifest import; `keyHex` in `SENSITIVE_LOG_KEYS`; log-spy test
  confirms `keyHex` not emitted during bootstrap failure
- [ ] `SCHEMA_VERSION` = 11; migration 011 registered
- [ ] Seed inserts in `migrations/index.ts` use plain strings (no `encryptField` calls)
- [ ] All integration tests that called `initFieldEncryption` updated

**Test suite:**
- [ ] `make test-unit` passes with zero failures
- [ ] `make test-integration` passes with zero failures
- [ ] `make test-e2e` passes with zero failures

**Documentation:**
- [ ] `CLAUDE.md` updated — no references to `node:sqlite`, `DatabaseSync`, field encryption
  manifest, or `EncryptedField` branded types remain

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Native addon fails to compile against Electron 41 | Medium | High | Gate task: verify before broad cleanup; pin version 5.4.3-3 |
| `:memory:` + PRAGMA key not supported by sqlcipher fork | Low | High | Gate task: smoke test before any other work; fallback to temp-file DBs in tests if needed |
| PRAGMA kdf_iter=1 placed after first table access (silently ignored) | Low | High | Enforce order in getDb(); wrong-key test will catch this |
| DatabaseSync type reference missed outside db/index.ts | Medium | Medium | Explicit grep DoD gate: `grep -r DatabaseSync src/` = zero hits |
| encryptField/decryptField in migration files (003, 004) cause compile error | High | High | Explicit task to audit all migration files; grep gate covers migrations/ |
| encryptField/decryptField call site missed in query cleanup | Low | Medium | grep DoD gates (zero hits required for all field-encryption symbols) |
| logger.ts redaction weakened after manifest deletion; keyHex leaks in log | Medium | High | keyHex in SENSITIVE_LOG_KEYS; log-spy test during bootstrap failure |
| Sentinel absent + encrypted DB → deleted (false legacy detection) | Medium | High | Header probe before delete; encrypted-DB-without-sentinel test in DoD |
| Packaged DMG fails to load native addon (forge.config.ts missing rebuildConfig) | Medium | High | Promote forge.config.ts audit to P0; packaged DMG launch test in DoD |
| SQLCipher version bundled is 3.x (weaker defaults) | Low | Medium | Confirm SQLCipher 4.x in gate task before proceeding |
| CI native addon cache miss on first push (expensive rebuild) | Medium | Low | Cache miss on first push is expected; subsequent runs hit cache |

## Security Considerations

- **Whole-DB encryption is strictly stronger than field-level:** schema, indexes, table names,
  and all column values are opaque to an attacker without the key
- **`PRAGMA kdf_iter = 1`** bypasses SQLCipher's built-in PBKDF2 — correct because scrypt in
  keyManager.ts (N=65536) already meets OWASP recommendations; double-KDF would add latency
  with no security benefit
- **keyHex never persists:** derived from `key.toString('hex')` as a local variable, passed
  directly to PRAGMA key; no intermediate storage, no logging
- **Wrong-key encrypted DB is preserved, not deleted:** clear error only; the sentinel mechanism
  handles plaintext legacy files only
- **logger.ts redaction preserved explicitly:** an explicit static allowlist replaces the
  manifest-coupled approach; this is simpler and less likely to have blind spots from manifest
  drift
- **`enabled_tools` remains unencrypted at the application layer** (it is encrypted on disk by
  SQLCipher) — contains only tool names, no user content or credentials
- **No `safeStorage`, no cookie encryption, no App Sandbox** — CLAUDE.md permanent constraints
  respected

## Observability & Rollback

**Verification post-ship:**
- `make test-integration` — any regression in data round-tripping surfaces here
- Hex dump: `strings polyphon.db | grep -i "your test string"` should produce zero hits
- Logger output: check for "SQLCipher database initialized" log line at startup
- Wrong-key test: rename `polyphon.key.json`, restart app → should show a clear error, not
  silent corruption or data deletion

**Rollback plan:**
- **This sprint is a data loss event for any existing local database.** The sentinel-based reset
  deletes the old plaintext DB on first launch. This is acceptable only because there are no
  production users. Do not ship this to real users without a migration path.
- Rollback means reverting the commit and running `npm install` to restore `node:sqlite`
- If CI build breaks native addon compilation, the release workflow fails before publishing;
  no user impact
- Old `node:sqlite` path can be restored from git history in under 10 minutes
- There is no programmatic rollback from the DB deletion; local development DBs are disposable

## Documentation

- [ ] `CLAUDE.md` Tech Stack table: Database row updated
- [ ] `CLAUDE.md` Database section: `node:sqlite`/`DatabaseSync` → `better-sqlite3-sqlcipher`;
  Setup code block updated
- [ ] `CLAUDE.md` Encrypted Fields section: remove manifest table, `EncryptedField` type
  description, and CI gate description; replace with SQLCipher note
- [ ] Any remaining `encryption.manifest.test.ts` references in `CLAUDE.md` removed

## Dependencies

- No dependency on a prior sprint
- `better-sqlite3-sqlcipher@5.4.3-3` must be compatible with Electron 41 — confirmed by gate task

## Open Questions

All open questions from the intent document are resolved:

1. **better-sqlite3-sqlcipher version** — confirmed 5.4.3-3 (Codex verified against npm registry)
2. **In-memory DB + SQLCipher** — expected to work; gate task confirms before proceeding
3. **PRAGMA kdf_iter = 1 placement** — first after `PRAGMA key`, before any table access; sanity
   query enforces this
4. **DB file detection on first launch** — sentinel file approach; wrong-key encrypted DBs fail
   loudly and are preserved
