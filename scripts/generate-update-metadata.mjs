#!/usr/bin/env node
/**
 * Generates latest-mac.yml for electron-updater consumption.
 *
 * Usage:
 *   node scripts/generate-update-metadata.mjs <zip-path> <version>
 *
 * Output: writes latest-mac.yml to the same directory as the zip file.
 */

import { createHash } from 'crypto';
import { readFileSync, statSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const [, , zipPath, version] = process.argv;

if (!zipPath || !version) {
  console.error('Usage: generate-update-metadata.mjs <zip-path> <version>');
  process.exit(1);
}

const filename = path.basename(zipPath);
const data = readFileSync(zipPath);
const sha512 = createHash('sha512').update(data).digest('base64');
const size = statSync(zipPath).size;
const releaseDate = new Date().toISOString();

const yml = `version: ${version}
files:
  - url: ${filename}
    sha512: ${sha512}
    size: ${size}
path: ${filename}
sha512: ${sha512}
releaseDate: '${releaseDate}'
`;

const outPath = path.join(path.dirname(zipPath), 'latest-mac.yml');
writeFileSync(outPath, yml, 'utf-8');
console.log(`Written: ${outPath}`);
