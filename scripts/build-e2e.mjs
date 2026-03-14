/**
 * Builds the Electron app for e2e testing, replicating what electron-forge package
 * does without creating a distributable bundle.
 *
 * Output layout:
 *   .vite/build/main.js       — main process
 *   .vite/build/preload.js    — preload script
 *   .vite/renderer/main_window/index.html — renderer
 */
import { build } from 'vite';
import { builtinModules } from 'module';

const RENDERER_NAME = 'main_window';

// All Node built-ins, matching what @electron-forge/plugin-vite externalises.
const nodeExternals = [
  'electron',
  'electron/main',
  'electron/common',
  ...builtinModules.flatMap((m) => [m, `node:${m}`]),
  'shell-env',
];

// 1. Main process — CJS lib build, all Node built-ins external.
await build({
  configFile: 'vite.main.config.ts',
  mode: 'production',
  define: {
    MAIN_WINDOW_VITE_DEV_SERVER_URL: '""',
    MAIN_WINDOW_VITE_NAME: JSON.stringify(RENDERER_NAME),
  },
  resolve: {
    conditions: ['node'],
    mainFields: ['module', 'jsnext:main', 'jsnext'],
  },
  build: {
    outDir: '.vite/build',
    emptyOutDir: false,
    copyPublicDir: false,
    lib: {
      entry: 'src/main/index.ts',
      fileName: () => 'main.js',
      formats: ['cjs'],
    },
    rollupOptions: {
      external: nodeExternals,
    },
  },
});

// 2. Preload — CJS rollup build, all Node built-ins + electron/renderer external.
await build({
  configFile: 'vite.preload.config.ts',
  mode: 'production',
  resolve: {
    conditions: ['node'],
    mainFields: ['module', 'jsnext:main', 'jsnext'],
  },
  build: {
    outDir: '.vite/build',
    emptyOutDir: false,
    copyPublicDir: false,
    rollupOptions: {
      external: [...nodeExternals, 'electron/renderer'],
      input: 'src/main/preload.ts',
      output: {
        format: 'cjs',
        inlineDynamicImports: true,
        entryFileNames: 'preload.js',
        chunkFileNames: '[name].js',
        assetFileNames: '[name].[ext]',
      },
    },
  },
});

// 3. Renderer — standard browser build with relative base so assets resolve correctly.
await build({
  configFile: 'vite.renderer.config.ts',
  mode: 'production',
  base: './',
  build: {
    outDir: `.vite/renderer/${RENDERER_NAME}`,
    emptyOutDir: true,
  },
});
