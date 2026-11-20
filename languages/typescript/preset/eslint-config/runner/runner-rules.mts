import type { ESLint, Linter } from 'eslint';
import vitest from '@vitest/eslint-plugin';
import jest from 'eslint-plugin-jest';
import globals from 'globals';
import { RUNNER_NAMES, TEST_RUNNERS } from '../../test-runner/runners.mts';
import { runnerVocabulary } from '../../test-runner/vocabulary/runner-vocabulary.mts';
import { nodeTestPlugin } from './node-test-plugin.mts';

export type RunnerLintConfig = {
  readonly plugins: Readonly<Record<string, ESLint.Plugin>>;
  readonly settings: Readonly<Record<string, unknown>>;
  readonly globals: Readonly<Record<string, boolean | 'readonly' | 'writable'>>;
  readonly rules: Linter.RulesRecord;
  readonly typedRules: Linter.RulesRecord;
};

type RunnerParts = Omit<RunnerLintConfig, 'typedRules'> & {
  readonly typedRules?: Linter.RulesRecord;
};

const EXPECT = 'expect';
const ASSERT = 'assert';
const NODE_TEST = 'node:test';
const MOCHA = 'mocha';

const EXPECT_ASSERTIONS = [EXPECT, ASSERT, 'expectTypeOf', 'assertType'];

const STRUCTURE_RULES: Linter.RulesRecord = {
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

const MATCHER_RULES: Linter.RulesRecord = {
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

const ASSERTION_NAMES: Readonly<Record<string, readonly string[]>> = {
  vitest: EXPECT_ASSERTIONS,
  jest: EXPECT_ASSERTIONS,
  node: [ASSERT, EXPECT, '*.assert', ...NODE_ASSERT_EXPORTS],
  mocha: [
    ASSERT,
    EXPECT,
    'should',
    '*.assert',
    '*.expect',
    'sinon.assert',
    '**.should',
    ...NODE_ASSERT_EXPORTS,
  ],
};

const NAMESPACES: Readonly<Record<string, string>> = {
  vitest: 'vitest',
  jest: 'jest',
  node: 'node-test',
  mocha: MOCHA,
};

export const RUNNER_RULE_NAMESPACES = Object.values(NAMESPACES);

const RUNNER_MODULES: Readonly<Record<string, string>> = {
  vitest: 'vitest',
  jest: '@jest/globals',
  node: NODE_TEST,
  mocha: MOCHA,
};

const RUNNER_LABELS: Readonly<Record<string, string>> = RUNNER_NAMES;

const UPSTREAM_IMPORT_GUARDS: Readonly<Record<string, readonly string[]>> = { vitest: ['node'] };

function wrongRunnerMessage(runner: string, other: string): string {
  return (
    `nitpicker runs this project's tests with ${String(RUNNER_LABELS[runner])}, which does not run ` +
    `${String(RUNNER_LABELS[other])} tests. Take the test functions from ${runnerVocabulary(runner).testFunctions}, ` +
    `or, if the project runs its tests with ${String(RUNNER_LABELS[other])}, set "tools.tests.runner" to "${other}" ` +
    'in nitpicker.config.json. An exception fits only when this file needs the module for another reason.'
  );
}

function wrongRunnerImports(runner: string): Linter.RulesRecord {
  const guarded = UPSTREAM_IMPORT_GUARDS[runner] ?? [];
  const others = TEST_RUNNERS.filter((other) => other !== runner && !guarded.includes(other));
  const paths = others.map((other) => ({
    name: RUNNER_MODULES[other],
    message: wrongRunnerMessage(runner, other),
  }));
  return { 'no-restricted-imports': ['error', { paths }] };
}

function namespaced(namespace: string, rules: Linter.RulesRecord): Linter.RulesRecord {
  return Object.fromEntries(
    Object.entries(rules).map(([name, setting]) => [`${namespace}/${name}`, setting]),
  );
}

function withAssertions(runner: string, rules: Linter.RulesRecord): Linter.RulesRecord {
  return {
    ...rules,
    'expect-expect': ['error', { assertFunctionNames: ASSERTION_NAMES[runner] }],
  };
}

function vitestConfig(): RunnerParts {
  return {
    plugins: vitest.configs.recommended.plugins,
    globals: vitest.configs.env.languageOptions.globals,
    settings: {},
    rules: {
      ...vitest.configs.recommended.rules,
      'vitest/expect-expect': ['error', { assertFunctionNames: ASSERTION_NAMES['vitest'] }],
      'vitest/no-conditional-in-test': 'error',
      'vitest/valid-expect': ['error', { maxArgs: 2 }],
      'vitest/require-awaited-expect-poll': 'error',
      'vitest/valid-expect-in-promise': 'error',
    },
  };
}

function jestConfig(): RunnerParts {
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

const NODE_TEST_TYPED_RULES: Linter.RulesRecord = {
  '@typescript-eslint/no-floating-promises': [
    'error',
    {
      allowForKnownSafeCalls: [{ from: 'package', package: NODE_TEST, name: NODE_TEST_FUNCTIONS }],
    },
  ],
};

function nodeTestConfig(): RunnerParts {
  const rules = withAssertions('node', STRUCTURE_RULES);
  return {
    plugins: { 'node-test': nodeTestPlugin(jest, Object.keys(rules)) },
    globals: {},
    settings: { jest: { globalPackage: NODE_TEST } },
    rules: namespaced('node-test', rules),
    typedRules: NODE_TEST_TYPED_RULES,
  };
}

function mochaConfig(): RunnerParts {
  return {
    plugins: { mocha: { rules: jest.rules } },
    globals: globals.mocha,
    settings: { jest: { globalPackage: MOCHA } },
    rules: namespaced(MOCHA, withAssertions(MOCHA, STRUCTURE_RULES)),
  };
}

const CONFIGS: Readonly<Record<string, () => RunnerParts>> = {
  vitest: vitestConfig,
  jest: jestConfig,
  node: nodeTestConfig,
  mocha: mochaConfig,
};

export function testRunnerLintConfig(
  runner: string,
  assertionHelpers: readonly string[] = [],
): RunnerLintConfig {
  const createConfig = CONFIGS[runner];
  if (createConfig === undefined) {
    throw new TypeError(`Unknown test runner: ${runner}`);
  }
  const config = createConfig();
  return {
    typedRules: {},
    ...config,
    rules: {
      ...config.rules,
      ...wrongRunnerImports(runner),
      [`${String(NAMESPACES[runner])}/expect-expect`]: [
        'error',
        {
          assertFunctionNames: [
            ...new Set([...(ASSERTION_NAMES[runner] ?? []), ...assertionHelpers]),
          ],
        },
      ],
    },
  };
}
