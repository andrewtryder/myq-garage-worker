import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: ['./src/**/*.ts'],
      exclude: ['./frontend/**', './dist/**'],
      thresholds: {
        statements: 70,
        branches: 60,
        functions: 70,
        lines: 70,
      },
    },
  },
});
