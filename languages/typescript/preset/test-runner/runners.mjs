export const TEST_RUNNERS = ['vitest', 'jest', 'node', 'mocha'];

export const DEFAULT_TEST_RUNNER = 'vitest';

export const RUNNER_NAMES = {
  vitest: 'Vitest',
  jest: 'Jest',
  node: 'node:test',
  mocha: 'Mocha',
};

export const RUNNER_PACKAGES = {
  vitest: 'vitest',
  jest: 'jest',
  mocha: 'mocha',
};

export const NODE_TEST_OPTIONS_NITPICKER_SETS = {
  flags: [
    '--watch',
    '--watch-preserve-output',
    '--test-only',
    '--experimental-test-coverage',
    '--test-update-snapshots',
  ],
  valued: [
    '--watch-path',
    '--test-reporter',
    '--test-reporter-destination',
    '--test-concurrency',
    '--test-timeout',
    '--test-shard',
    '--test-coverage-include',
    '--test-coverage-exclude',
    '--test-coverage-branches',
    '--test-coverage-functions',
    '--test-coverage-lines',
  ],
};

export const MOCHA_OPTIONS_NITPICKER_SETS = {
  flags: ['--watch', '-w', '--forbid-only', '--bail', '-b'],
  valued: [
    '--reporter',
    '-R',
    '--reporter-option',
    '--reporter-options',
    '-O',
    '--timeout',
    '-t',
    '--retries',
    '--watch-files',
    '--watch-ignore',
  ],
};

export const JEST_OPTIONS_NITPICKER_SETS = {
  flags: [
    '--watch',
    '--watchAll',
    '--coverage',
    '--collectCoverage',
    '--json',
    '--ci',
    '--silent',
    '--passWithNoTests',
    '--onlyChanged',
    '-o',
    '--onlyFailures',
    '-f',
    '--lastCommit',
    '--changedFilesWithAncestor',
    '--showConfig',
    '--listTests',
    '--clearCache',
  ],
  valued: [
    '--outputFile',
    '--coverageDirectory',
    '--coverageProvider',
    '--coverageThreshold',
    '--testTimeout',
    '--maxWorkers',
    '-w',
    '--changedSince',
    '--shard',
    '--testNamePattern',
    '-t',
  ],
  variadic: [
    '--findRelatedTests',
    '--collectCoverageFrom',
    '--coveragePathIgnorePatterns',
    '--coverageReporters',
    '--reporters',
  ],
};
