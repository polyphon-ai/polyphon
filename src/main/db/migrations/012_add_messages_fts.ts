import type Database from 'better-sqlite3';

export function up(db: Database.Database): void {
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
      content,
      voice_name,
      content='messages',
      content_rowid='rowid'
    );

    CREATE TRIGGER IF NOT EXISTS messages_fts_ai AFTER INSERT ON messages BEGIN
      INSERT INTO messages_fts(rowid, content, voice_name)
      VALUES (new.rowid, new.content, new.voice_name);
    END;

    CREATE TRIGGER IF NOT EXISTS messages_fts_ad AFTER DELETE ON messages BEGIN
      INSERT INTO messages_fts(messages_fts, rowid, content, voice_name)
      VALUES ('delete', old.rowid, old.content, old.voice_name);
    END;

    CREATE TRIGGER IF NOT EXISTS messages_fts_au AFTER UPDATE ON messages BEGIN
      INSERT INTO messages_fts(messages_fts, rowid, content, voice_name)
      VALUES ('delete', old.rowid, old.content, old.voice_name);
      INSERT INTO messages_fts(rowid, content, voice_name)
      VALUES (new.rowid, new.content, new.voice_name);
    END;
  `);

  // Backfill all existing messages into the FTS index.
  db.exec(`INSERT INTO messages_fts(messages_fts) VALUES ('rebuild')`);
}
