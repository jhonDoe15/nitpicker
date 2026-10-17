import vitest from '@vitest/eslint-plugin';
import jest from 'eslint-plugin-jest';
import globals from 'globals';
import { RUNNER_NAMES, TEST_RUNNERS } from '../../test-runner/runners.mjs';
import { runnerVocabulary } from '../../test-runner/runner-vocabulary.mjs';
import { nodeTestPlugin } from './node-test-plugin.mjs';

const EXPECT_ASSERTIONS = ['expect', 'assert', 'expectTypeOf', 'assertType'];

const STRUCTURE_RULES = {
  'expect-expect': 'error',
  'no-commented-out-tests': 'error',
  'no-conditional-expect': 'error',
  'no-conditional-in-test': 'error',
  'no-disabled-tests': 'warn',
  'no-focused-tests': 'error',
  'no-identical-title': 'error',
  'no-standalone-expect': 'error',
  'valid-describe-callback': 'error',
  'valid-expect-in-promise': 'error',
  'valid-title': 'error',
};

const MATCHER_RULES = {
  'no-interpolation-in-snapshots': 'error',
  'no-mocks-import': 'error',
  'no-unneeded-async-expect-function': 'error',
  'valid-expect': 'error',
};

const NODE_ASSERT_EXPORTS = [
  'ok',
  'equal',
  'notEqual',
  'strictEqual',
  'notStrictEqual',
  'deepEqual',
  'notDeepEqual',
  'deepStrictEqual',
  'notDeepStrictEqual',
  'partialDeepStrictEqual',
  'throws',
  'doesNotThrow',
  'rejects',
  'doesNotReject',
  'match',
  'doesNotMatch',
  'fail',
  'ifError',
];

const ASSERTION_NAMES = {
  vitest: EXPECT_ASSERTIONS,
  jest: EXPECT_ASSERTIONS,
  node: ['assert', 'expect', '*.assert', ...NODE_ASSERT_EXPORTS],
  mocha: [
    'assert',
    'expect',
    'should',
    '*.assert',
    '*.expect',
    'sinon.assert',
    '**.should',
    ...NODE_ASSERT_EXPORTS,
  ],
};

const NAMESPACES = { vitest: 'vitest', jest: 'jest', node: 'node-test', mocha: 'mocha' };

export const RUNNER_RULE_NAMESPACES = Object.values(NAMESPACES);

const RUNNER_MODULES = {
  vitest: 'vitest',
  jest: '@jest/globals',
  node: 'node:test',
  mocha: 'mocha',
};

const UPSTREAM_IMPORT_GUARDS = { vitest: ['node'] };

function wrongRunnerMessage(runner, other) {
  return (
    `nitpicker runs this project's tests with ${RUNNER_NAMES[runner]}, which does not run ` +
    `${RUNNER_NAMES[other]} tests. Take the test functions from ${runnerVocabulary(runner).testFunctions}, ` +
    `or, if the project runs its tests with ${RUNNER_NAMES[other]}, set "tools.tests.runner" to "${other}" ` +
    'in nitpicker.config.json. If this file needs the module for another reason, ' +
    'add an exception for no-restricted-imports for it in nitpicker.config.json.'
  );
}

function wrongRunnerImports(runner) {
  const guarded = UPSTREAM_IMPORT_GUARDS[runner] ?? [];
  const others = TEST_RUNNERS.filter((other) => other !== runner && !guarded.includes(other));
  const paths = others.map((other) => ({
    name: RUNNER_MODULES[other],
    message: wrongRunnerMessage(runner, other),
  }));
  return { 'no-restricted-imports': ['error', { paths }] };
}

function namespaced(namespace, rules) {
  return Object.fromEntries(
    Object.entries(rules).map(([name, setting]) => [`${namespace}/${name}`, setting]),
  );
}

function withAssertions(runner, rules) {
  return {
    ...rules,
    'expect-expect': ['error', { assertFunctionNames: ASSERTION_NAMES[runner] }],
  };
}

function vitestConfig() {
  return {
    plugins: vitest.configs.recommended.plugins,
    globals: vitest.configs.env.languageOptions.globals,
    settings: {},
    rules: {
      ...vitest.configs.recommended.rules,
      'vitest/expect-expect': ['error', { assertFunctionNames: ASSERTION_NAMES.vitest }],
      'vitest/no-conditional-in-test': 'error',
      'vitest/valid-expect': ['error', { maxArgs: 2 }],
      'vitest/require-awaited-expect-poll': 'error',
      'vitest/valid-expect-in-promise': 'error',
    },
  };
}

function jestConfig() {
  return {
    plugins: { jest },
    globals: globals.jest,
    settings: {},
    rules: namespaced('jest', withAssertions('jest', { ...STRUCTURE_RULES, ...MATCHER_RULES })),
  };
}

const NODE_TEST_FUNCTIONS = [
  'test',
  'suite',
  'it',
  'describe',
  'skip',
  'todo',
  'only',
  'expectFailure',
];

const NODE_TEST_TYPED_RULES = {
  '@typescript-eslint/no-floating-promises': [
    'error',
    {
      allowForKnownSafeCalls: [
        { from: 'package', package: 'node:test', name: NODE_TEST_FUNCTIONS },
      ],
    },
  ],
};

function nodeTestConfig() {
  const rules = withAssertions('node', STRUCTURE_RULES);
  return {
    plugins: { 'node-test': nodeTestPlugin(jest, Object.keys(rules)) },
    globals: {},
    settings: { jest: { globalPackage: 'node:test' } },
    rules: namespaced('node-test', rules),
    typedRules: NODE_TEST_TYPED_RULES,
  };
}

function mochaConfig() {
  return {
    plugins: { mocha: { rules: jest.rules } },
    globals: globals.mocha,
    settings: { jest: { globalPackage: 'mocha' } },
    rules: namespaced('mocha', withAssertions('mocha', STRUCTURE_RULES)),
  };
}

const CONFIGS = {
  vitest: vitestConfig,
  jest: jestConfig,
  node: nodeTestConfig,
  mocha: mochaConfig,
};

export function testRunnerLintConfig(runner) {
  const config = CONFIGS[runner]();
  return {
    typedRules: {},
    ...config,
    rules: { ...config.rules, ...wrongRunnerImports(runner) },
  };
}
