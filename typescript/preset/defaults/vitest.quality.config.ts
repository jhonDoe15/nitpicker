import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    maxWorkers: 4,
    projects: [
      {
        test: {
          name: 'quality-unit',
          root: '.',
          include: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
        },
      },
      {
        test: {
          name: 'quality-integration',
          root: '.',
          include: [
            'test/**/*.test.ts',
            'tests/**/*.test.ts',
            'test/**/*.spec.ts',
            'tests/**/*.spec.ts',
          ],
          testTimeout: 10_000,
        },
      },
    ],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}'],
      exclude: [
        'src/**/__tests__/**',
        'src/**/*.{test,spec}.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
        '**/dist/**',
        '**/build/**',
        '**/generated/**',
        '**/*.d.ts',
        'src/vitest.config.ts',
        'src/main/vitest.config.ts',
      ],
      reporter: ['text', 'json'],
      reportsDirectory: 'reports/quality/coverage',
    },
  },
});
