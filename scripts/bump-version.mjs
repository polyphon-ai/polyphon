#!/usr/bin/env node
/**
 * Bumps the version in all monorepo package.json files atomically.
 *
 * Usage:
 *   node scripts/bump-version.mjs <version>
 *   node scripts/bump-version.mjs 0.9.0
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(root, '..');

const [, , version] = process.argv;

if (!version || !/^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/.test(version)) {
  console.error('Usage: node scripts/bump-version.mjs <version>');
  console.error('Example: node scripts/bump-version.mjs 0.9.0');
  process.exit(1);
}

const packages = [
  'package.json',
  'packages/poly/package.json',
];

for (const pkgPath of packages) {
  const full = resolve(repoRoot, pkgPath);
  const pkg = JSON.parse(readFileSync(full, 'utf-8'));
  const prev = pkg.version;
  pkg.version = version;
  writeFileSync(full, JSON.stringify(pkg, null, 2) + '\n', 'utf-8');
  console.log(`  ${pkgPath}: ${prev} → ${version}`);
}

console.log(`\nBumped all packages to ${version}`);
