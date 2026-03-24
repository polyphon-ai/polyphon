import type Database from 'better-sqlite3';

export function up(db: Database.Database): void {
  const now = Date.now();
  db.prepare(`
    INSERT OR IGNORE INTO app_settings (key, value, updated_at) VALUES ('api_enabled', 'false', ?)
  `).run(now);
  db.prepare(`
    INSERT OR IGNORE INTO app_settings (key, value, updated_at) VALUES ('api_remote_access_enabled', 'false', ?)
  `).run(now);
}
