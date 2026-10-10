import eslint from '@eslint/js';
import vitest from '@vitest/eslint-plugin';
import sonarjs from 'eslint-plugin-sonarjs';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import nitpickerRules from '../eslint-plugin/index.mjs';
import { errorWrappingPolicy } from '../eslint-config/error-wrapping-policy.mjs';
import { strictPresetConfig } from '../eslint-config/strict.mjs';
import { applyRuleExceptions } from '../eslint-config/exceptions.mjs';
import { readHeadPolicy, readLayout } from '../head-policy.mjs';

// The head policy comes from nitpicker.config.json; without it the preset defaults apply.
const policy = readHeadPolicy();

const layout = readLayout();
const { sourceGlobs, testGlobs, excludedGlobs, unitTestGlobs } = layout;
const parserOptions = {
  project: './tsconfig.quality.json',
  tsconfigRootDir: import.meta.dirname,
};
const productionFiles = sourceGlobs;
const testFiles = testGlobs;
const selectedFiles = [...productionFiles, ...testFiles];

const presetConfig = tseslint.config(
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
      sonarjs,
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { disallowTypeAnnotations: false, fixStyle: 'separate-type-imports' },
      ],
      'sonarjs/cognitive-complexity': ['error', 15],
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
  ...strictPresetConfig(layout, parserOptions),
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
    languageOptions: {
      ...vitest.configs.env.languageOptions,
      globals: {
        ...globals.node,
        ...vitest.configs.env.languageOptions.globals,
      },
      parserOptions: {
        project: './tsconfig.quality.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      ...vitest.configs.recommended.rules,
      'nitpicker/integration-test-uses-approved-harness': 'error',
      'nitpicker/container-pause-requires-finally-unpause': 'error',
      'nitpicker/bounded-container-teardown': 'error',
      'nitpicker/no-fixed-sleep-synchronization': 'error',
      'nitpicker/no-interval-polling-in-tests': 'error',
      'nitpicker/no-mocking-subject-under-test': 'error',
      'nitpicker/no-internal-module-mocks': 'error',
      'nitpicker/no-wait-for-with-fake-timers': 'error',
      'nitpicker/test-must-use-production-runtime': 'error',
      'vitest/require-awaited-expect-poll': 'error',
      'vitest/valid-expect-in-promise': 'error',
    },
  },
  {
    files: unitTestGlobs,
    rules: { 'nitpicker/no-external-executables-in-unit-tests': 'error' },
  },
);

export default applyRuleExceptions(presetConfig, policy.exceptions);
