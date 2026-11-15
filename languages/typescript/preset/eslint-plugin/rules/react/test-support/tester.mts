import { configuredRuleTester, type TypedRuleTester } from '../../../test-support/rule-tester.mts';
import tseslint from 'typescript-eslint';

export function createReactRuleTester(): TypedRuleTester {
  return configuredRuleTester({
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parser: tseslint.parser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  });
}

export const filename = '/repo/src/main/ui/panel.tsx';
