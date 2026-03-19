import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    watch: {
      ignored: ['**/site/**'],
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? '0.0.0'),
  },
  build: {
    rollupOptions: {
      external: ['node:sqlite'],
      output: {
        entryFileNames: 'main.js',
      },
    },
  },
});
