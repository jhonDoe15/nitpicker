export default {
  mutate: [
    'src/main/**/*.ts',
    '!src/main/**/__tests__/**',
    '!src/main/**/*.test.ts',
    '!src/main/**/*.spec.ts',
    '!src/main/**/*.d.ts',
    '!src/main/dist/**',
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
  ignorePatterns: ['src/main/dist', 'tests/integration', 'reports'],
};
