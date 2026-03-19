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
      external: ['node:sqlite', '@anthropic-ai/sdk', 'openai', '@google/generative-ai'],
      output: {
        entryFileNames: 'main.js',
      },
    },
  },
});
