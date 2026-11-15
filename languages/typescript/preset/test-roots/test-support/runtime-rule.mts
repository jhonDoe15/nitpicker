import { RuleTester, type Rule } from 'eslint';
import { afterAll, afterEach, beforeAll, beforeEach, describe, it } from 'vitest';
import { rule } from '../../eslint-plugin/rules/testing/assertions/test-must-use-production-runtime.mts';
import { ruleModule } from '../../eslint-plugin/test-support/rule-tester.mts';

export function productionRuntimeRule(): Rule.RuleModule {
  Object.assign(RuleTester, {
    afterAll,
    afterEach,
    beforeAll,
    beforeEach,
    describe,
    it,
    itOnly: it.only,
  });
  return ruleModule(rule);
}
