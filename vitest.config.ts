import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.{ts,tsx}', 'src/**/*.integration.test.{ts,tsx}'],
    exclude: ['e2e/**', 'node_modules/**'],
    environment: 'node',
  },
});
