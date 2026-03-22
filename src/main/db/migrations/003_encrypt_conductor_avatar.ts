import type Database from 'better-sqlite3';

// No-op: field-level encryption was removed in migration 011 (SQLCipher transition).
// Legacy plaintext DBs are detected and deleted at startup; there is nothing to migrate.
export function up(_db: Database.Database): void {}
