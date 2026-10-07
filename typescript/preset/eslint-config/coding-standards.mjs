import tseslint from 'typescript-eslint';
import nitpickerRules from '../eslint-plugin/index.mjs';
import { errorWrappingPolicy } from './error-wrapping-policy.mjs';

export default [
  { ignores: ['**/dist/**', '**/node_modules/**'] },
  {
    files: ['src/main/**/*.ts', 'tests/**/*.ts'],
    languageOptions: { parser: tseslint.parser },
    plugins: { nitpicker: nitpickerRules, '@typescript-eslint': tseslint.plugin },
    rules: {
      'nitpicker/no-wait-for-with-fake-timers': 'error',
      'nitpicker/no-internal-module-mocks': 'error',
      'nitpicker/preserve-error-cause': ['error', errorWrappingPolicy],
    },
  },
  {
    files: ['src/main/**/__tests__/**/*.ts', 'tests/unit/**/*.ts'],
    rules: { 'nitpicker/no-external-executables-in-unit-tests': 'error' },
  },
  {
    files: ['src/main/**/*.ts'],
    ignores: ['**/__tests__/**', '**/*.test.ts', '**/*.spec.ts'],
    rules: {
      'nitpicker/structured-catch-logging': 'error',
      '@typescript-eslint/consistent-type-assertions': ['error', { assertionStyle: 'never' }],
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
];
