import tseslint from 'typescript-eslint';
import { nitpickerRules } from '../../eslint-plugin/index.mjs';
import { errorWrappingPolicy } from './error-wrapping-policy.mjs';
import { readHeadPolicy, readLayout } from '../../head-policy.mjs';
import { applyMatchingRuleExceptions } from '../exceptions.mjs';

const { sourceGlobs, testGlobs, excludedGlobs, unitTestGlobs } = readLayout();

const config = [
  { ignores: excludedGlobs },
  {
    files: [...sourceGlobs, ...testGlobs],
    languageOptions: { parser: tseslint.parser },
    plugins: { nitpicker: nitpickerRules, '@typescript-eslint': tseslint.plugin },
    rules: {
      'nitpicker/no-wait-for-with-fake-timers': 'error',
      'nitpicker/no-internal-module-mocks': 'error',
      'nitpicker/preserve-error-cause': ['error', errorWrappingPolicy],
    },
  },
  {
    files: unitTestGlobs,
    rules: { 'nitpicker/no-external-executables-in-unit-tests': 'error' },
  },
  {
    files: sourceGlobs,
    ignores: ['**/__tests__/**', '**/*.test.ts', '**/*.spec.ts'],
    rules: {
      'nitpicker/structured-catch-logging': 'error',
    },
  },
];

export default applyMatchingRuleExceptions(config, readHeadPolicy().exceptions);
