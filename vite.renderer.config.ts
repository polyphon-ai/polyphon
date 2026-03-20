import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Strip the <meta> CSP tag from index.html in dev mode.
// The meta tag is a fallback for production file:// loads (onHeadersReceived
// does not fire for file:// in Electron 41). In dev the Vite server responds
// via HTTP, so installCsp() sets the header CSP. When both are present the
// browser enforces the intersection — the strict meta policy wins and blocks
// Vite HMR inline scripts and the WebSocket connection.
function stripMetaCspPlugin(): Plugin {
  return {
    name: 'strip-meta-csp',
    transformIndexHtml(html) {
      return html.replace(/<meta\s+http-equiv="Content-Security-Policy"[^>]*>\s*/i, '');
    },
  };
}

export default defineConfig(({ command }) => ({
  plugins: [react(), tailwindcss(), ...(command === 'serve' ? [stripMetaCspPlugin()] : [])],
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? '0.0.0'),
  },
  server: {
    watch: {
      ignored: ['**/site/**'],
    },
  },
  optimizeDeps: {
    entries: ['src/renderer/**/*.{ts,tsx}'],
  },
}));
