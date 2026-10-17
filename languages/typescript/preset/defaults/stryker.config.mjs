import { fileURLToPath } from 'node:url';
import { readLayout } from '../head-policy.mjs';

const {
  sourceGlobs,
  testGlobs,
  runtimeExcludedGlobs,
  testRoots,
  sourceRoots,
  sourceTestDirectoryGlobs,
} = readLayout();

export default {
  mutate: [
    ...sourceGlobs,
    ...runtimeExcludedGlobs.map((glob) => `!${glob}`),
    ...sourceTestDirectoryGlobs.map((glob) => `!${glob}`),
    ...testGlobs.map((glob) => `!${glob}`),
  ],
  plugins: ['@stryker-mutator/vitest-runner', '@stryker-mutator/typescript-checker'].map((name) =>
    fileURLToPath(import.meta.resolve(name)),
  ),
  testRunner: 'vitest',
  checkers: ['typescript'],
  tsconfigFile: 'tsconfig.stryker.json',
  disableTypeChecks: false,
  coverageAnalysis: 'perTest',
  vitest: {
    configFile: 'vitest.quality.config.ts',
    related: false,
  },
  reporters: ['clear-text', 'progress', 'json'],
  jsonReporter: {
    fileName: 'reports/quality/mutation/mutation.json',
  },
  thresholds: {
    break: 0,
  },
  ignorePatterns: [
    ...sourceRoots.map((root) => `${root}/dist`),
    ...testRoots.map((root) => `${root}/integration`),
    'reports',
    '.nitpicker-*',
    '!.nitpicker-diff-stryker.*',
    '!.nitpicker-diff-tsconfig.stryker.json',
  ],
};
