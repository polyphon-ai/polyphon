#!/usr/bin/env node
// Syncs all SDK source files from polyphon/src/sdk/ to polyphon-js/src/.
// Transforms import paths from polyphon (bundler, no extensions) to polyphon-js (NodeNext ESM).
// Also transforms ../../shared/* and ../shared/* references to the correct relative paths.
//
// Usage: node scripts/sync-sdk.mjs [path-to-polyphon-js]
//   Default polyphon-js path: ../polyphon-js (sibling directory)

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const polyphonRoot = resolve(__dir, '..');
const polyphonJsRoot = process.argv[2]
  ? resolve(process.argv[2])
  : resolve(polyphonRoot, '../polyphon-js');

const HEADER = '// AUTO-SYNCED from polyphon/src/sdk — do not edit by hand\n\n';

/**
 * Transform import/export paths from polyphon format to polyphon-js NodeNext ESM format.
 *
 * @param {string} content - source file content
 * @param {boolean} isInSubdir - true for files in testing/ (one level deeper)
 */
function transform(content, isInSubdir) {
  if (isInSubdir) {
    // Files in src/sdk/testing/ → polyphon-js/src/testing/
    // ../../shared/api → ../api.js
    // ../../shared/types → ../types.js
    content = content
      .replace(/from '\.\.\/\.\.\/shared\/api'/g, "from '../api.js'")
      .replace(/from '\.\.\/\.\.\/shared\/types'/g, "from '../types.js'");
  } else {
    // Files in src/sdk/ → polyphon-js/src/
    // ../shared/api → ./api.js
    // ../shared/types → ./types.js
    content = content
      .replace(/from '\.\.\/shared\/api'/g, "from './api.js'")
      .replace(/from '\.\.\/shared\/types'/g, "from './types.js'");
  }

  // Add .js extension to all relative imports/exports that don't already have one.
  // Matches: from './foo'  from '../bar'  export * from './baz'
  content = content.replace(/from '(\.[./][^']+)'/g, (match, importPath) => {
    if (/\.[a-zA-Z0-9]+$/.test(importPath)) return match; // already has extension
    return `from '${importPath}.js'`;
  });

  return content;
}

function syncFile(srcRelPath, dstRelPath, isInSubdir = false) {
  const src = resolve(polyphonRoot, srcRelPath);
  const dst = resolve(polyphonJsRoot, dstRelPath);
  const content = readFileSync(src, 'utf8');
  const transformed = HEADER + transform(content, isInSubdir);
  mkdirSync(dirname(dst), { recursive: true });
  writeFileSync(dst, transformed, 'utf8');
  console.log(`  ${srcRelPath} → ${dstRelPath}`);
}

console.log(`Syncing SDK: polyphon → ${polyphonJsRoot}`);

// Root-level SDK files
syncFile('src/sdk/client.ts', 'src/client.ts');
syncFile('src/sdk/errors.ts', 'src/errors.ts');
syncFile('src/sdk/token.ts',  'src/token.ts');
syncFile('src/sdk/index.ts',  'src/index.ts');

// Testing utilities (subdirectory — one level deeper in both repos)
syncFile('src/sdk/testing/MockPolyphonServer.ts', 'src/testing/MockPolyphonServer.ts', true);
syncFile('src/sdk/testing/fixtures.ts',           'src/testing/fixtures.ts', true);
syncFile('src/sdk/testing/index.ts',              'src/testing/index.ts', true);

// Test files
syncFile('src/sdk/client.test.ts',                     'src/client.test.ts');
syncFile('src/sdk/token.test.ts',                      'src/token.test.ts');
syncFile('src/sdk/testing/MockPolyphonServer.test.ts', 'src/testing/MockPolyphonServer.test.ts', true);

console.log('Done.');
