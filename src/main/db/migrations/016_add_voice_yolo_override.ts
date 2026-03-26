import type Database from 'better-sqlite3';

export function up(db: Database.Database): void {
  // NULL = inherit from provider_configs; 1 = force on; 0 = force off
  db.exec('ALTER TABLE composition_voices ADD COLUMN yolo_mode_override INTEGER');
}
