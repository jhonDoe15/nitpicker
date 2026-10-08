import eslint from '@eslint/js';
import vitest from '@vitest/eslint-plugin';
import sonarjs from 'eslint-plugin-sonarjs';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import nitpickerRules from '../eslint-plugin/index.mjs';
import { errorWrappingPolicy } from '../eslint-config/error-wrapping-policy.mjs';
import { applyRuleExceptions } from '../eslint-config/exceptions.mjs';
import { readHeadPolicy } from '../head-policy.mjs';
import { layoutGlobs } from '../layout.mjs';

// The head policy comes from nitpicker.config.json; without it the preset defaults apply.
const policy = readHeadPolicy();
const { sourceGlobs, testGlobs, excludedGlobs } = layoutGlobs(policy.layout);

const productionFiles = sourceGlobs;
const testFiles = testGlobs;
const selectedFiles = [...productionFiles, ...testFiles];

const presetConfig = tseslint.config(
  {
    ignores: [...excludedGlobs, ...policy.exclude, '.stryker-tmp/**'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    files: selectedFiles,
    languageOptions: {
      globals: globals.node,
      parserOptions: {
        project: './tsconfig.quality.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      sonarjs,
    },
    rules: {
      '@typescript-eslint/consistent-type-assertions': ['error', { assertionStyle: 'never' }],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { disallowTypeAnnotations: false, fixStyle: 'separate-type-imports' },
      ],
      '@typescript-eslint/explicit-member-accessibility': 'error',
      '@typescript-eslint/no-unsafe-type-assertion': 'error',
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
    files: ['src/**/__tests__/**/*.ts', 'test/unit/**/*.ts', 'tests/unit/**/*.ts'],
    rules: { 'nitpicker/no-external-executables-in-unit-tests': 'error' },
  },
);

export default applyRuleExceptions(presetConfig, policy.exceptions);
