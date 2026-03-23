/**
 * SQLCipher integration tests.
 *
 * These tests verify the whole-database encryption contract:
 * - Encrypted databases are opaque to SQLite without the key
 * - The correct key unlocks the database
 * - A wrong key is rejected
 * - kdf_iter=1 bypasses PBKDF2 (fast open for production)
 * - Round-trip data through encrypted database is correct
 * - Legacy plaintext detection via SQLITE_MAGIC header
 *
 * NOTE: These tests open real files on disk (tmpdir) to validate the
 * encrypted binary format. In-memory databases (:memory:) cannot test
 * the on-disk encryption aspect.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { runMigrations } from './migrations';
import { SCHEMA_VERSION } from './schema';

const KEY_HEX = 'a'.repeat(64); // 32-byte all-0xAA key
const WRONG_KEY_HEX = 'b'.repeat(64);
const SQLITE_MAGIC = Buffer.from('SQLite format 3\x00');

function openEncrypted(dbPath: string, keyHex: string): Database.Database {
  const db = new Database(dbPath);
  db.pragma(`key = "x'${keyHex}'"`);
  db.pragma('kdf_iter = 1');
  return db;
}

describe('SQLCipher — key validation regex', () => {
  it('accepts a valid 64-char hex key', () => {
    expect(/^[0-9a-f]{64}$/.test(KEY_HEX)).toBe(true);
  });

  it('rejects a key that is too short', () => {
    expect(/^[0-9a-f]{64}$/.test('a'.repeat(63))).toBe(false);
  });

  it('rejects a key that is too long', () => {
    expect(/^[0-9a-f]{64}$/.test('a'.repeat(65))).toBe(false);
  });

  it('rejects uppercase hex (key must be lowercase)', () => {
    expect(/^[0-9a-f]{64}$/.test('A'.repeat(64))).toBe(false);
  });

  it('rejects non-hex characters', () => {
    expect(/^[0-9a-f]{64}$/.test('g'.repeat(64))).toBe(false);
  });
});

describe('SQLCipher — on-disk encryption', () => {
  let tmpDir: string;
  let dbPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'polyphon-sqlcipher-test-'));
    dbPath = path.join(tmpDir, 'test.db');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('encrypted DB header is NOT the SQLite plaintext magic', () => {
    const db = openEncrypted(dbPath, KEY_HEX);
    db.exec('CREATE TABLE t (v TEXT)');
    db.close();

    const header = Buffer.alloc(16);
    const fd = fs.openSync(dbPath, 'r');
    fs.readSync(fd, header, 0, 16, 0);
    fs.closeSync(fd);

    expect(header.equals(SQLITE_MAGIC)).toBe(false);
  });

  it('plaintext DB header IS the SQLite plaintext magic', () => {
    // Open without key = unencrypted
    const db = new Database(dbPath);
    db.exec('CREATE TABLE t (v TEXT)');
    db.close();

    const header = Buffer.alloc(16);
    const fd = fs.openSync(dbPath, 'r');
    fs.readSync(fd, header, 0, 16, 0);
    fs.closeSync(fd);

    expect(header.equals(SQLITE_MAGIC)).toBe(true);
  });

  it('vanilla sqlite3 CLI reports "file is not a database" for encrypted file', () => {
    const db = openEncrypted(dbPath, KEY_HEX);
    db.exec('CREATE TABLE t (v TEXT)');
    db.prepare('INSERT INTO t VALUES (?)').run('secret');
    db.close();

    // The system sqlite3 CLI has no SQLCipher support — querying an encrypted DB
    // must fail with an error message indicating the file is unreadable as plaintext SQLite.
    let stderr = '';
    try {
      execFileSync('sqlite3', [dbPath, 'SELECT count(*) FROM sqlite_master'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (err: unknown) {
      stderr = (err as { stderr?: string }).stderr ?? '';
    }
    expect(stderr).toMatch(/not a database|encrypted/i);
  });

  it('correct key unlocks the database and allows queries', () => {
    const db = openEncrypted(dbPath, KEY_HEX);
    db.exec('CREATE TABLE t (v TEXT)');
    db.prepare('INSERT INTO t VALUES (?)').run('hello');
    db.close();

    const db2 = openEncrypted(dbPath, KEY_HEX);
    const row = db2.prepare('SELECT v FROM t').get() as { v: string };
    db2.close();

    expect(row.v).toBe('hello');
  });

  it('wrong key causes an error when querying', () => {
    const db = openEncrypted(dbPath, KEY_HEX);
    db.exec('CREATE TABLE t (v TEXT)');
    db.close();

    const db2 = openEncrypted(dbPath, WRONG_KEY_HEX);
    expect(() => {
      db2.prepare('SELECT count(*) FROM sqlite_master').get();
    }).toThrow();
    db2.close();
  });

  it('kdf_iter=1 opens the database successfully (bypass PBKDF2)', () => {
    const db = openEncrypted(dbPath, KEY_HEX);
    db.exec('CREATE TABLE t (v TEXT)');
    db.close();

    // Re-open with kdf_iter=1 explicitly — this should not throw
    const db2 = new Database(dbPath);
    db2.pragma(`key = "x'${KEY_HEX}'"`);
    db2.pragma('kdf_iter = 1');
    expect(() => {
      db2.prepare('SELECT count(*) FROM sqlite_master').get();
    }).not.toThrow();
    db2.close();
  });

  it('different keys produce different ciphertext (distinct encrypted files)', () => {
    const dbPath2 = path.join(tmpDir, 'test2.db');

    const db1 = openEncrypted(dbPath, KEY_HEX);
    db1.exec("CREATE TABLE t (v TEXT); INSERT INTO t VALUES ('same-value')");
    db1.close();

    const db2 = openEncrypted(dbPath2, WRONG_KEY_HEX);
    db2.exec("CREATE TABLE t (v TEXT); INSERT INTO t VALUES ('same-value')");
    db2.close();

    const bytes1 = fs.readFileSync(dbPath);
    const bytes2 = fs.readFileSync(dbPath2);
    // Files should differ (different keys produce different ciphertext)
    expect(bytes1.equals(bytes2)).toBe(false);
  });
});

describe('SQLCipher — runMigrations on encrypted database', () => {
  let tmpDir: string;
  let dbPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'polyphon-sqlcipher-migrations-'));
    dbPath = path.join(tmpDir, 'polyphon.db');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('runMigrations succeeds on a fresh encrypted database', () => {
    const db = openEncrypted(dbPath, KEY_HEX);
    db.pragma('journal_mode = WAL');
    expect(() => runMigrations(db)).not.toThrow();
    db.close();
  });

  it('schema_version is set to current version after fresh install', () => {
    const db = openEncrypted(dbPath, KEY_HEX);
    db.pragma('journal_mode = WAL');
    runMigrations(db);
    const row = db.prepare('SELECT version FROM schema_version').get() as { version: number };
    db.close();
    expect(row.version).toBe(SCHEMA_VERSION);
  });

  it('seed data is accessible after encrypted migration', () => {
    const db = openEncrypted(dbPath, KEY_HEX);
    db.pragma('journal_mode = WAL');
    runMigrations(db);
    const tones = db.prepare('SELECT id FROM tones WHERE is_builtin = 1').all() as { id: string }[];
    db.close();
    expect(tones.length).toBeGreaterThanOrEqual(5);
  });

  it('data round-trips correctly through encrypted database', () => {
    const db = openEncrypted(dbPath, KEY_HEX);
    db.pragma('journal_mode = WAL');
    runMigrations(db);
    db.prepare("UPDATE user_profile SET conductor_name = ? WHERE id = 1").run('Test Conductor');
    db.close();

    // Reopen with same key
    const db2 = openEncrypted(dbPath, KEY_HEX);
    db2.pragma('journal_mode = WAL');
    const row = db2.prepare('SELECT conductor_name FROM user_profile WHERE id = 1').get() as { conductor_name: string };
    db2.close();

    expect(row.conductor_name).toBe('Test Conductor');
  });

  it('is idempotent — runMigrations twice on encrypted DB does not fail', () => {
    const db = openEncrypted(dbPath, KEY_HEX);
    db.pragma('journal_mode = WAL');
    runMigrations(db);
    expect(() => runMigrations(db)).not.toThrow();
    db.close();
  });
});

describe('SQLCipher — PRAGMA key format', () => {
  let tmpDir: string;
  let dbPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'polyphon-sqlcipher-pragma-'));
    dbPath = path.join(tmpDir, 'test.db');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('PRAGMA key with x-notation accepts a 64-char hex key', () => {
    const db = new Database(dbPath);
    expect(() => {
      db.pragma(`key = "x'${KEY_HEX}'"`);
      db.pragma('kdf_iter = 1');
      db.prepare('SELECT count(*) FROM sqlite_master').get();
    }).not.toThrow();
    db.close();
  });

  it('rekey changes the encryption key', () => {
    const db = openEncrypted(dbPath, KEY_HEX);
    db.exec('CREATE TABLE t (v TEXT)');
    db.prepare('INSERT INTO t VALUES (?)').run('secret');
    db.pragma(`rekey = "x'${WRONG_KEY_HEX}'"`);
    db.close();

    // Old key should fail
    const db2 = openEncrypted(dbPath, KEY_HEX);
    expect(() => {
      db2.prepare('SELECT count(*) FROM sqlite_master').get();
    }).toThrow();
    db2.close();

    // New key should succeed
    const db3 = openEncrypted(dbPath, WRONG_KEY_HEX);
    const row = db3.prepare('SELECT v FROM t').get() as { v: string };
    db3.close();
    expect(row.v).toBe('secret');
  });
});
