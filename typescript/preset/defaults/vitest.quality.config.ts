import { readFileSync } from 'node:fs';
import { configDefaults, defineConfig } from 'vitest/config';

// This file is copied into the analyzed project, so it cannot import the package. It reads the
// head policy the CLI delivers through NITPICKER_POLICY and mirrors the defaults in
// preset/layout.mjs (a test keeps the two in step).
const policyFile = process.env.NITPICKER_POLICY;
const policy = policyFile ? JSON.parse(readFileSync(policyFile, 'utf8')) : {};
const sourceRoots: string[] = policy.layout?.sourceRoots ?? ['src'];
const testRoots: string[] = policy.layout?.testRoots ?? ['test', 'tests'];
const exclude: string[] = policy.exclude ?? [];
const codeExtensions = '{ts,tsx,mts,cts,js,jsx,mjs,cjs}';

export default defineConfig({
  test: {
    maxWorkers: 4,
    projects: [
      {
        test: {
          name: 'quality-unit',
          root: '.',
          include: sourceRoots.flatMap((root) => [`${root}/**/*.test.ts`, `${root}/**/*.spec.ts`]),
          exclude: [...configDefaults.exclude, ...exclude],
        },
      },
      {
        test: {
          name: 'quality-integration',
          root: '.',
          include: testRoots.flatMap((root) => [`${root}/**/*.test.ts`, `${root}/**/*.spec.ts`]),
          exclude: [...configDefaults.exclude, ...exclude],
          testTimeout: 10_000,
        },
      },
    ],
    coverage: {
      provider: 'v8',
      include: sourceRoots.map((root) => `${root}/**/*.${codeExtensions}`),
      exclude: [
        ...sourceRoots.flatMap((root) => [
          `${root}/**/__tests__/**`,
          `${root}/**/*.{test,spec}.${codeExtensions}`,
        ]),
        '**/dist/**',
        '**/build/**',
        '**/generated/**',
        '**/*.d.ts',
        ...sourceRoots.flatMap((root) => [
          `${root}/vitest.config.ts`,
          `${root}/main/vitest.config.ts`,
        ]),
        ...exclude,
      ],
      reporter: ['text', 'json'],
      reportsDirectory: 'reports/quality/coverage',
    },
  },
});
