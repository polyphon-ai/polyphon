import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import fs from 'fs';
import { app } from 'electron';
import { runMigrations } from './migrations';

let _db: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (!_db) {
    const userDataDir = process.env.POLYPHON_TEST_USER_DATA ?? app.getPath('userData');
    fs.mkdirSync(userDataDir, { recursive: true });
    const dbPath = path.join(userDataDir, 'polyphon.db');
    _db = new DatabaseSync(dbPath);
    _db.exec('PRAGMA journal_mode = WAL');
    runMigrations(_db);
  }
  return _db;
}

export function closeDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}
