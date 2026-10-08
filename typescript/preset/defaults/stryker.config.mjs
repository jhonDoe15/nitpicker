import { readLayout } from '../head-policy.mjs';

const { sourceGlobs, testGlobs, excludedGlobs, testRoots, sourceRoots, sourceTestDirectoryGlobs } =
  readLayout();

export default {
  mutate: [
    ...sourceGlobs,
    ...excludedGlobs.map((glob) => `!${glob}`),
    ...sourceTestDirectoryGlobs.map((glob) => `!${glob}`),
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
  ignorePatterns: [
    ...sourceRoots.map((root) => `${root}/dist`),
    ...testRoots.map((root) => `${root}/integration`),
    'reports',
  ],
};
