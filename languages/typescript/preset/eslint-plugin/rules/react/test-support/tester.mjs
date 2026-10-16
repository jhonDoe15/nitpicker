import { RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';
import { afterAll, afterEach, beforeAll, beforeEach, describe, it } from 'vitest';

export function createReactRuleTester() {
  Object.assign(RuleTester, {
    afterAll,
    afterEach,
    beforeAll,
    beforeEach,
    describe,
    it,
    itOnly: it.only,
  });
  return new RuleTester({
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parser: tseslint.parser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  });
}

export const filename = '/repo/src/main/ui/panel.tsx';
