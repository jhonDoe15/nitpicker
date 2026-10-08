import eslint from '@eslint/js';
import vitest from '@vitest/eslint-plugin';
import sonarjs from 'eslint-plugin-sonarjs';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import nitpickerRules from '../eslint-plugin/index.mjs';
import { errorWrappingPolicy } from '../eslint-config/error-wrapping-policy.mjs';
import { sourceGlobs, testGlobs, excludedGlobs } from '../layout.mjs';

const productionFiles = sourceGlobs;
const testFiles = testGlobs;
const selectedFiles = [...productionFiles, ...testFiles];

export default tseslint.config(
  {
    ignores: [...excludedGlobs, '.stryker-tmp/**'],
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
