const ASSERT_FUNCTIONS = ['assert', 'assert.*', 't.assert.*'];

const NODE_TEST_REGISTRARS = [
  'after',
  'afterEach',
  'before',
  'beforeEach',
  'describe',
  'it',
  'suite',
  'test',
];

const JEST_GLOBALS = {
  jest: 'readonly',
  describe: 'readonly',
  it: 'readonly',
  test: 'readonly',
  expect: 'readonly',
  beforeAll: 'readonly',
  afterAll: 'readonly',
  beforeEach: 'readonly',
  afterEach: 'readonly',
};

export function testRunnerLintSettings(runner, vitestGlobals) {
  if (runner === 'jest') {
    return {
      globals: JEST_GLOBALS,
      rules: { 'vitest/prefer-called-exactly-once-with': 'off' },
    };
  }
  if (runner === 'node-test') {
    return {
      globals: {},
      rules: {
        'vitest/no-import-node-test': 'off',
        '@typescript-eslint/no-floating-promises': [
          'error',
          {
            allowForKnownSafeCalls: [
              { from: 'package', package: '@types/node', name: NODE_TEST_REGISTRARS },
            ],
          },
        ],
        'vitest/expect-expect': ['error', { assertFunctionNames: ['expect', ...ASSERT_FUNCTIONS] }],
      },
    };
  }
  return { globals: vitestGlobals, rules: {} };
}

export function testRunnerSettings(runner) {
  return runner === 'vitest' ? {} : { settings: { nitpicker: { testRunner: runner } } };
}
