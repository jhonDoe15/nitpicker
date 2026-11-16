import { linterConfigs } from '../typed/config-types.mts';
import tseslint from 'typescript-eslint';
import { nitpickerRules } from '../../eslint-plugin/index.mts';
import { errorWrappingPolicy } from './error-wrapping-policy.mts';
import { applyMatchingRuleExceptions, readHeadPolicy, readLayout } from '../typed/policy-views.mts';

const { sourceGlobs, testGlobs, excludedGlobs, unitTestGlobs } = readLayout();

const config = linterConfigs([
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
]);

export default applyMatchingRuleExceptions(config, readHeadPolicy().exceptions);
