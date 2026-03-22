import type Database from 'better-sqlite3';

/**
 * Marker migration for the SQLCipher whole-database encryption transition.
 * Field-level encryption has been removed; the DB is now encrypted at the
 * SQLCipher layer. Legacy plaintext DBs are detected and deleted at startup
 * (see db/index.ts sentinel logic), so no data migration is needed here.
 */
export function up(_db: Database.Database): void {
  // no-op: encryption is now handled at the SQLCipher layer
}
