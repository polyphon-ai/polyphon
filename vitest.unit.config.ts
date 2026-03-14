import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'unit',
    // Unit tests: *.test.ts / *.test.tsx — excludes *.integration.test.* files
    include: ['src/**/*.test.{ts,tsx}'],
    exclude: ['src/**/*.integration.test.{ts,tsx}', 'node_modules/**'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/**/*.integration.test.{ts,tsx}'],
    },
  },
});
