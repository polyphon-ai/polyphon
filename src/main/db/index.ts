import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { createRequire } from 'node:module';
import { app } from 'electron';
import { runMigrations } from './migrations';
import { logger } from '../utils/logger';

// When running under Electron, the native binding must be the Electron-ABI build
// (saved to prebuilt-electron/ by scripts/build-sqlcipher.mjs --mode=electron).
// When running under Node.js (Vitest), the default build/Release/ binary is used.
const _require = createRequire(import.meta.url);
const _nativeBinding: string | undefined = process.versions.electron
  ? path.join(path.dirname(_require.resolve('better-sqlite3/package.json')), 'prebuilt-electron', 'better_sqlite3.node')
  : undefined;

const SENTINEL_FILE = 'sqlcipher-migrated-v1';
const SQLITE_MAGIC = Buffer.from('SQLite format 3\x00');

let _db: Database.Database | null = null;

export function getDb(keyHex: string): Database.Database {
  if (!_db) {
    if (!/^[0-9a-f]{64}$/.test(keyHex)) {
      throw new Error(`Invalid keyHex: expected 64 hex chars, got length ${keyHex.length}`);
    }
    const userDataDir = process.env.POLYPHON_TEST_USER_DATA ?? app.getPath('userData');
    fs.mkdirSync(userDataDir, { recursive: true });
    const dbPath = path.join(userDataDir, 'polyphon.db');
    const walPath = dbPath + '-wal';
    const shmPath = dbPath + '-shm';
    const sentinelPath = path.join(userDataDir, SENTINEL_FILE);

    if (!fs.existsSync(sentinelPath)) {
      if (fs.existsSync(dbPath)) {
        const header = Buffer.alloc(16);
        const fd = fs.openSync(dbPath, 'r');
        fs.readSync(fd, header, 0, 16, 0);
        fs.closeSync(fd);
        if (header.equals(SQLITE_MAGIC)) {
          logger.warn('Plaintext legacy DB detected; deleting and starting fresh');
          fs.rmSync(dbPath, { force: true });
          fs.rmSync(walPath, { force: true });
          fs.rmSync(shmPath, { force: true });
        } else {
          throw new Error('Encrypted DB exists without sentinel — refusing to delete. Key may be wrong.');
        }
      }
      fs.writeFileSync(sentinelPath, '', { mode: 0o600 });
    }

    const db = new Database(dbPath, _nativeBinding ? { nativeBinding: _nativeBinding } : {});
    db.pragma(`key = "x'${keyHex}'"`);
    db.pragma('kdf_iter = 1');
    db.prepare('SELECT count(*) FROM sqlite_master').get();
    db.pragma('journal_mode = WAL');
    runMigrations(db);
    _db = db;
    logger.info('SQLCipher database initialized');
  }
  return _db;
}

export function closeDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}
