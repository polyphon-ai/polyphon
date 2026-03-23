#!/usr/bin/env node
/**
 * Build better-sqlite3 with the SQLCipher 4.14.0 amalgamation.
 *
 * Modes:
 *   --mode=node      Build for system Node.js (used by Vitest integration tests).
 *                    Output: node_modules/better-sqlite3/build/Release/better_sqlite3.node
 *   --mode=electron  Build for Electron (used by the packaged app).
 *                    Output: node_modules/better-sqlite3/build/Release/better_sqlite3.node
 *                    Also copies to: node_modules/better-sqlite3/prebuilt-electron/better_sqlite3.node
 *
 * The SQLCipher amalgamation lives at deps/sqlcipher/sqlite3.{c,h} — SQLCipher 4.14.0
 * based on SQLite 3.51.3, compiled with SQLCIPHER_CRYPTO_CC (macOS CommonCrypto, no
 * external deps). This script patches the better-sqlite3 gyp files in-place before
 * building to add the required SQLCipher compile-time defines and macOS framework links.
 *
 * Why two modes?
 *   Electron uses a different ABI (NODE_MODULE_VERSION) than system Node.js, so the
 *   same .node binary cannot be used for both Vitest tests and the Electron app.
 *   The Node.js build is the default (lives in build/Release/) and is used by Vitest.
 *   electron-rebuild overwrites it with the Electron build before the app starts.
 *   The electron build is also saved to prebuilt-electron/ for the make install flow.
 */

import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const sqlcipherDir = join(root, 'deps', 'sqlcipher');
const nodeGypBin = join(root, 'node_modules', '.bin', 'node-gyp');
const bsqliteDir = join(root, 'node_modules', 'better-sqlite3');
const electronBuildDir = join(bsqliteDir, 'prebuilt-electron');

const mode = process.argv.find(a => a.startsWith('--mode='))?.split('=')[1] ?? 'node';

if (!existsSync(join(sqlcipherDir, 'sqlite3.c'))) {
  console.error('ERROR: SQLCipher amalgamation not found at deps/sqlcipher/sqlite3.c');
  console.error('Run the following to regenerate it:');
  console.error('  cd /tmp && tar -xzf sqlcipher-4.14.0.tar.gz && cd sqlcipher-4.14.0');
  console.error('  CFLAGS="-DSQLITE_HAS_CODEC -DSQLITE_ENABLE_COLUMN_METADATA" ./configure --with-tempstore=yes');
  console.error('  make sqlite3.c && cp sqlite3.{c,h} <project>/deps/sqlcipher/');
  process.exit(1);
}

// Patch better-sqlite3 gyp files in-place to add SQLCipher defines and framework links.
// These modifications are idempotent — if already present they are left unchanged.
function patchGypFiles() {
  // 1. deps/sqlite3.gyp — add SQLCipher compile-time defines
  const sqlite3GypPath = join(bsqliteDir, 'deps', 'sqlite3.gyp');
  const sqlite3Gyp = readFileSync(sqlite3GypPath, 'utf8');
  const sqlcipherDefines = [
    "            'SQLITE_HAS_CODEC',",
    "            'SQLCIPHER_CRYPTO_CC',",
    "            'SQLITE_TEMP_STORE=2',",
    "            'SQLITE_EXTRA_INIT=sqlcipher_extra_init',",
    "            'SQLITE_EXTRA_SHUTDOWN=sqlcipher_extra_shutdown',",
  ].join('\n');
  const marker = "            'SQLITE_ENABLE_COLUMN_METADATA',";
  if (!sqlite3Gyp.includes('SQLITE_HAS_CODEC')) {
    writeFileSync(sqlite3GypPath, sqlite3Gyp.replace(marker, marker + '\n' + sqlcipherDefines));
  }

  // Add SQLITE_ENABLE_FTS5 if not already present (idempotent, separate patch)
  const sqlite3GypCurrent = readFileSync(sqlite3GypPath, 'utf8');
  if (!sqlite3GypCurrent.includes('SQLITE_ENABLE_FTS5')) {
    const fts5Marker = "            'SQLITE_ENABLE_COLUMN_METADATA',";
    writeFileSync(sqlite3GypPath, sqlite3GypCurrent.replace(fts5Marker, fts5Marker + "\n            'SQLITE_ENABLE_FTS5',"));
  }

  // 2. binding.gyp — add Security and CoreFoundation framework links for macOS CommonCrypto
  const bindingGypPath = join(bsqliteDir, 'binding.gyp');
  const bindingGyp = readFileSync(bindingGypPath, 'utf8');
  const frameworkBlock = [
    "        ['sqlite3 != \"\"', {",
    "          'link_settings': {",
    "            'libraries': [",
    "              '-framework Security',",
    "              '-framework CoreFoundation',",
    "            ],",
    "          },",
    "        }],",
  ].join('\n');
  const linuxBlock = "        ['OS==\"linux\"', {";
  if (!bindingGyp.includes('-framework Security')) {
    const idx = bindingGyp.indexOf(linuxBlock);
    if (idx !== -1) {
      // Insert the framework block before the Linux block
      writeFileSync(bindingGypPath, bindingGyp.slice(0, idx) + frameworkBlock + '\n' + bindingGyp.slice(idx));
    }
  }
}

patchGypFiles();

const exec = (cmd, opts) => execSync(cmd, { stdio: 'inherit', cwd: root, ...opts });

if (mode === 'node') {
  console.log('Building better-sqlite3 + SQLCipher for system Node.js (Vitest)...');
  exec(`"${nodeGypBin}" rebuild --sqlite3="${sqlcipherDir}" --directory="${bsqliteDir}"`);
  console.log('✓ Node.js build complete');
} else if (mode === 'electron') {
  console.log('Building better-sqlite3 + SQLCipher for Electron...');
  exec(`npx electron-rebuild -f -w better-sqlite3 --extra-args="--sqlite3=${sqlcipherDir}"`);
  mkdirSync(electronBuildDir, { recursive: true });
  copyFileSync(
    join(bsqliteDir, 'build', 'Release', 'better_sqlite3.node'),
    join(electronBuildDir, 'better_sqlite3.node'),
  );
  console.log(`✓ Electron build complete (also saved to prebuilt-electron/)`);
} else {
  console.error(`Unknown mode: ${mode}. Use --mode=node or --mode=electron`);
  process.exit(1);
}
