import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'integration',
    // Integration tests: *.integration.test.ts / *.integration.test.tsx only
    include: ['src/**/*.integration.test.{ts,tsx}'],
    environment: 'node',
    // Integration tests can be slower — give them more room
    testTimeout: 30_000,
    hookTimeout: 30_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/**/*.integration.test.{ts,tsx}'],
    },
  },
});
