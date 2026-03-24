#!/usr/bin/env node
/**
 * Asserts that all packages in the monorepo share the same version as the
 * root package.json. Run before publishing or as part of CI.
 *
 * Usage:
 *   node scripts/check-versions.mjs
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(root, '..');

function readVersion(pkgPath) {
  const full = resolve(repoRoot, pkgPath);
  const pkg = JSON.parse(readFileSync(full, 'utf-8'));
  return { path: pkgPath, version: pkg.version, name: pkg.name };
}

const packages = [
  'package.json',
  'packages/poly/package.json',
];

const resolved = packages.map(readVersion);
const rootVersion = resolved[0].version;

let ok = true;
for (const pkg of resolved) {
  const match = pkg.version === rootVersion;
  const icon = match ? '✓' : '✗';
  console.log(`  ${icon}  ${pkg.name.padEnd(28)} ${pkg.version}${match ? '' : `  ← expected ${rootVersion}`}`);
  if (!match) ok = false;
}

if (!ok) {
  console.error('\nVersion mismatch detected. Run: node scripts/bump-version.mjs <version>');
  process.exit(1);
}

console.log(`\nAll packages at ${rootVersion} ✓`);
