import globals from 'globals';
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

const ASSERTION_NAMES = {
  vitest: EXPECT_ASSERTIONS,
  jest: EXPECT_ASSERTIONS,
  node: ['assert', 'expect', '*.assert'],
  mocha: ['assert', 'expect', 'sinon.assert', '**.should'],
};

const NAMESPACES = { vitest: 'vitest', jest: 'jest', node: 'node-test', mocha: 'mocha' };

export const RUNNER_RULE_NAMESPACES = Object.values(NAMESPACES);

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

async function vitestConfig() {
  const { default: vitest } = await import('@vitest/eslint-plugin');
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

async function jestConfig() {
  const { default: jest } = await import('eslint-plugin-jest');
  return {
    plugins: { jest },
    globals: globals.jest,
    settings: {},
    rules: namespaced('jest', withAssertions('jest', { ...STRUCTURE_RULES, ...MATCHER_RULES })),
  };
}

async function nodeTestConfig() {
  const { default: jest } = await import('eslint-plugin-jest');
  const rules = withAssertions('node', STRUCTURE_RULES);
  return {
    plugins: { 'node-test': nodeTestPlugin(jest, Object.keys(rules)) },
    globals: {},
    settings: { jest: { globalPackage: 'node:test' } },
    rules: namespaced('node-test', rules),
  };
}

async function mochaConfig() {
  const { default: jest } = await import('eslint-plugin-jest');
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
  return CONFIGS[runner]();
}
