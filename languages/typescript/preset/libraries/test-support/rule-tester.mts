import { RuleTester } from 'eslint';
import { afterAll, afterEach, beforeAll, beforeEach, describe, it } from 'vitest';
import tseslint from 'typescript-eslint';

Object.assign(RuleTester, {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  it,
  itOnly: it.only,
});

type RuleCases = { valid: readonly unknown[]; invalid: readonly unknown[] };

const ruleTesterClass: new (options: ConstructorParameters<typeof RuleTester>[0]) => {
  run(name: string, rule: unknown, cases: RuleCases): void;
} = RuleTester;

export const tester = new ruleTesterClass({
  languageOptions: { ecmaVersion: 'latest', sourceType: 'module', parser: tseslint.parser },
});
