import { build } from 'esbuild';
import { writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

await build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'cjs',
  outfile: 'dist/index.js',
  external: [],
  minify: false,
  sourcemap: false,
});

// Inject shebang
const outfile = join('dist', 'index.js');
const content = readFileSync(outfile, 'utf-8');
writeFileSync(outfile, '#!/usr/bin/env node\n' + content, { mode: 0o755 });
console.log('Built dist/index.js');
