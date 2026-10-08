import { sourceGlobs, testGlobs, excludedGlobs, testRoots } from '../layout.mjs';

export default {
  mutate: [
    ...sourceGlobs,
    ...excludedGlobs.map((glob) => `!${glob}`),
    '!src/**/__tests__/**',
    ...testGlobs.map((glob) => `!${glob}`),
  ],
  testRunner: 'vitest',
  checkers: ['typescript'],
  tsconfigFile: 'tsconfig.stryker.json',
  disableTypeChecks: false,
  coverageAnalysis: 'perTest',
  vitest: {
    configFile: 'stryker.vitest.config.ts',
    related: false,
  },
  reporters: ['clear-text', 'progress', 'json'],
  jsonReporter: {
    fileName: 'reports/quality/mutation/mutation.json',
  },
  thresholds: {
    break: null,
  },
  ignorePatterns: ['src/dist', ...testRoots.map((root) => `${root}/integration`), 'reports'],
};
