#!/usr/bin/env node
// Syncs all SDK source files from polyphon/src/sdk/ to polyphon-js/src/.
// Also syncs shared types (src/shared/types.ts, src/shared/api.ts).
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

const SDK_HEADER    = '// AUTO-SYNCED from polyphon/src/sdk — do not edit by hand\n\n';
const SHARED_HEADER = '// AUTO-SYNCED from polyphon/src/shared — do not edit by hand\n\n';

/**
 * Add .js extension to all relative import/export/inline-import paths that lack one.
 * Handles: from './foo'  export * from '../bar'  import('./baz')
 *
 * @param {string} content
 */
function addJsExtensions(content) {
  // from '...' and export * from '...'
  content = content.replace(/from '(\.[./][^']+)'/g, (match, p) =>
    /\.[a-zA-Z0-9]+$/.test(p) ? match : `from '${p}.js'`
  );
  // inline import('...')
  content = content.replace(/import\('(\.[./][^']+)'\)/g, (match, p) =>
    /\.[a-zA-Z0-9]+$/.test(p) ? match : `import('${p}.js')`
  );
  return content;
}

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

  return addJsExtensions(content);
}

function syncFile(srcRelPath, dstRelPath, isInSubdir = false, header = SDK_HEADER) {
  const src = resolve(polyphonRoot, srcRelPath);
  const dst = resolve(polyphonJsRoot, dstRelPath);
  const content = readFileSync(src, 'utf8');
  const transformed = header + transform(content, isInSubdir);
  mkdirSync(dirname(dst), { recursive: true });
  writeFileSync(dst, transformed, 'utf8');
  console.log(`  ${srcRelPath} → ${dstRelPath}`);
}

console.log(`Syncing SDK: polyphon → ${polyphonJsRoot}`);

// Shared types (source of truth for the API contract)
syncFile('src/shared/types.ts', 'src/types.ts', false, SHARED_HEADER);
syncFile('src/shared/api.ts',   'src/api.ts',   false, SHARED_HEADER);

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
