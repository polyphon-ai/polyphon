import { defineConfig } from 'vite';

export default defineConfig({
  define: {
    __BUILD_TIMESTAMP__: JSON.stringify(Date.now()),
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? '0.0.0'),
  },
  build: {
    rollupOptions: {
      // shell-env is ESM-only; keep external so we can load it via dynamic import()
      external: ['shell-env', 'node:sqlite'],
      output: {
        entryFileNames: 'main.js',
      },
    },
  },
});
