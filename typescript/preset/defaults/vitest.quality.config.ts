import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    maxWorkers: 4,
    projects: [
      {
        test: {
          name: 'quality-unit',
          root: '.',
          include: ['src/main/**/__tests__/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'quality-integration',
          root: './tests',
          include: ['**/*.test.ts'],
          testTimeout: 10_000,
        },
      },
    ],
    coverage: {
      provider: 'v8',
      include: ['src/main/**/*.ts'],
      exclude: [
        'src/main/**/__tests__/**',
        'src/main/**/*.test.ts',
        'src/main/dist/**',
        'src/main/**/*.d.ts',
        'src/main/vitest.config.ts',
      ],
      reporter: ['text', 'json'],
      reportsDirectory: 'reports/quality/coverage',
    },
  },
});
