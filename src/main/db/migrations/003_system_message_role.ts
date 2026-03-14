import type { DatabaseSync } from 'node:sqlite';

export function up(db: DatabaseSync): void {
  // SQLite does not support ALTER COLUMN — recreate the messages table
  // with the updated CHECK constraint, preserving all existing data.
  db.exec(`
    CREATE TABLE messages_new (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK(role IN ('conductor', 'voice', 'system')),
      voice_id TEXT,
      voice_name TEXT,
      content TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      round_index INTEGER NOT NULL,
      metadata TEXT
    );

    INSERT INTO messages_new SELECT * FROM messages;

    DROP TABLE messages;

    ALTER TABLE messages_new RENAME TO messages;
  `);
}
