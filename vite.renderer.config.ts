import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    watch: {
      ignored: ['**/site/**'],
    },
  },
  optimizeDeps: {
    entries: ['src/renderer/**/*.{ts,tsx}'],
  },
});
