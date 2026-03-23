import type Database from 'better-sqlite3';

export function getSetting(db: Database.Database, key: string): string | null {
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

export function setSetting(db: Database.Database, key: string, value: string): void {
  db.prepare(`
    INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run(key, value, Date.now());
}

export function getBooleanSetting(db: Database.Database, key: string, fallback: boolean): boolean {
  const value = getSetting(db, key);
  if (value === null) return fallback;
  return value === 'true';
}

export function setBooleanSetting(db: Database.Database, key: string, value: boolean): void {
  setSetting(db, key, value ? 'true' : 'false');
}
