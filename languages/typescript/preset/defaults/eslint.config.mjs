import eslint from '@eslint/js';
import { defineConfig } from 'eslint/config';
import vitest from '@vitest/eslint-plugin';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import { nitpickerRules } from '../eslint-plugin/index.mjs';
import { errorWrappingPolicy } from '../eslint-config/policies/error-wrapping-policy.mjs';
import { strictPresetConfig } from '../eslint-config/strict.mjs';
import { applyRuleExceptions } from '../eslint-config/exceptions.mjs';
import {
  applyJavascriptDialect,
  javascriptRuleEntries,
} from '../../../javascript/preset/eslint-dialect.mjs';
import { reactRuleIds, reactTestRuleIds } from '../eslint-config/react/react-rules.mjs';
import {
  analyzedProjectRoot,
  isReactProject,
  reactScopeConfigFor,
} from '../eslint-config/react/react-scope.mjs';
import { readHeadPolicy, readLayout } from '../head-policy.mjs';
import { configuredTestRunner } from '../test-runner/runners.mjs';
import { resolveTestRunner } from '../test-runner/resolve.mjs';
import { testRunnerLintSettings, testRunnerSettings } from '../test-runner/configs/lint-config.mjs';

const policy = readHeadPolicy();

const layout = readLayout();
const react = isReactProject({ projectRoot: analyzedProjectRoot(), react: policy.react });
const testRunner = resolveTestRunner({
  projectRoot: analyzedProjectRoot(),
  layout,
  configured: configuredTestRunner(policy),
}).runner;
const runnerLint = testRunnerLintSettings(testRunner, vitest.configs.env.languageOptions.globals);
const { sourceGlobs, testGlobs, excludedGlobs, unitTestGlobs } = layout;
const parserOptions = {
  project: './tsconfig.quality.json',
  tsconfigRootDir: import.meta.dirname,
};
const productionFiles = sourceGlobs;
const testFiles = testGlobs;
const selectedFiles = [...productionFiles, ...testFiles];

const presetConfig = defineConfig(
  {
    ignores: [...excludedGlobs, '.stryker-tmp/**'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    files: selectedFiles,
    languageOptions: {
      globals: globals.node,
      parserOptions,
    },
    plugins: {
      nitpicker: nitpickerRules,
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { disallowTypeAnnotations: false, fixStyle: 'separate-type-imports' },
      ],
      'nitpicker/cognitive-complexity': ['error', 15],
    },
  },
  {
    files: productionFiles,
    ignores: testFiles,
    plugins: {
      nitpicker: nitpickerRules,
    },
    rules: {
      'nitpicker/no-managed-resource-construction-outside-composition-roots': 'error',
      'nitpicker/preserve-error-cause': ['error', errorWrappingPolicy],
    },
  },
  ...strictPresetConfig(layout, parserOptions, { react }),
  ...(react ? await reactScopeConfigFor(layout, policy.react) : []),
  {
    // eslint-errors reports this rule for all production code; reporting it here too lists every
    files: productionFiles,
    ignores: testFiles,
    plugins: { nitpicker: nitpickerRules },
    rules: { 'nitpicker/no-silent-catch': 'off' },
  },
  {
    files: productionFiles,
    ignores: [...testFiles, ...layout.sourceTestDirectoryGlobs],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
  {
    ...vitest.configs.recommended,
    files: testFiles,
    plugins: {
      ...vitest.configs.recommended.plugins,
      nitpicker: nitpickerRules,
    },
    ...testRunnerSettings(testRunner),
    languageOptions: {
      ...vitest.configs.env.languageOptions,
      globals: {
        ...globals.node,
        ...runnerLint.globals,
      },
      parserOptions: {
        project: './tsconfig.quality.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      ...vitest.configs.recommended.rules,
      ...runnerLint.rules,
      'nitpicker/integration-test-uses-approved-harness': 'error',
      'nitpicker/container-pause-requires-finally-unpause': 'error',
      'nitpicker/bounded-container-teardown': 'error',
      'nitpicker/no-fixed-sleep-synchronization': 'error',
      'nitpicker/no-interval-polling-in-tests': 'error',
      'nitpicker/no-mocking-subject-under-test': 'error',
      'nitpicker/no-internal-module-mocks': 'error',
      'nitpicker/no-wait-for-with-fake-timers': 'error',
      'nitpicker/no-partial-output-assertion': 'error',
      'nitpicker/test-must-use-production-runtime': 'error',
      'vitest/no-conditional-in-test': 'error',
      'vitest/valid-expect': ['error', { maxArgs: 2 }],
      'vitest/require-awaited-expect-poll': 'error',
      'vitest/valid-expect-in-promise': 'error',
    },
  },
  {
    files: unitTestGlobs,
    rules: { 'nitpicker/no-external-executables-in-unit-tests': 'error' },
  },
);

const applicableExceptions = react
  ? policy.exceptions
  : policy.exceptions.filter(
      ({ rule }) => !reactRuleIds.includes(rule) && !reactTestRuleIds.includes(rule),
    );

export default applyRuleExceptions(
  applyJavascriptDialect(
    [...presetConfig, ...javascriptRuleEntries(policy, selectedFiles)],
    policy,
  ),
  applicableExceptions,
);
