import { RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';
import { afterAll, afterEach, beforeAll, beforeEach, describe, it } from 'vitest';

Object.assign(RuleTester, {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  it,
  itOnly: it.only,
});

export function createRuleTester() {
  return new RuleTester({
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module', parser: tseslint.parser },
  });
}
