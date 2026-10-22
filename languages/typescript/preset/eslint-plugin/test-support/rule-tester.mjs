import { RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';
import { afterAll, afterEach, beforeAll, beforeEach, describe, it } from 'vitest';

export function typescriptRuleTester(parserOptions) {
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
      ...(parserOptions === undefined ? {} : { parserOptions }),
    },
  });
}
