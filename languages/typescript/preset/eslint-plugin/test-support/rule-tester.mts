import { RuleTester, type Linter, type Rule } from 'eslint';
import tseslint from 'typescript-eslint';
import { afterAll, afterEach, beforeAll, beforeEach, describe, it } from 'vitest';

type RuleTests = Parameters<RuleTester['run']>[2];

export type TypedRuleTester = {
  run(name: string, rule: unknown, tests: RuleTests): void;
};

function isRuleModule(value: unknown): value is Rule.RuleModule {
  return (
    typeof value === 'object' &&
    value !== null &&
    'create' in value &&
    typeof value.create === 'function'
  );
}

export function ruleModule(value: unknown): Rule.RuleModule {
  if (!isRuleModule(value)) {
    throw new TypeError('The value is not an ESLint rule module.');
  }
  return value;
}

function typedRuleTester(tester: RuleTester): TypedRuleTester {
  return {
    run(name, rule, tests) {
      tester.run(name, ruleModule(rule), tests);
    },
  };
}

export function configuredRuleTester(config: Linter.Config): TypedRuleTester {
  Object.assign(RuleTester, {
    afterAll,
    afterEach,
    beforeAll,
    beforeEach,
    describe,
    it,
    itOnly: it.only,
  });
  return typedRuleTester(new RuleTester(config));
}

export function typescriptRuleTester(parserOptions?: Linter.ParserOptions): TypedRuleTester {
  return configuredRuleTester({
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parser: tseslint.parser,
      ...(parserOptions === undefined ? {} : { parserOptions }),
    },
  });
}

export function cases(codes: readonly string[]): { code: string }[] {
  return codes.map((code) => ({ code }));
}
