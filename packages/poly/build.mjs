import { build } from 'esbuild';
import { writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const pkg = JSON.parse(readFileSync('package.json', 'utf-8'));

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
  define: {
    __POLY_VERSION__: JSON.stringify(pkg.version),
  },
});

// Inject shebang
const outfile = join('dist', 'index.js');
const content = readFileSync(outfile, 'utf-8');
writeFileSync(outfile, '#!/usr/bin/env node\n' + content, { mode: 0o755 });
console.log('Built dist/index.js');
