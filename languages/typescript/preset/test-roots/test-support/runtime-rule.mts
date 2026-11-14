import { RuleTester, type Rule } from 'eslint';
import { afterAll, afterEach, beforeAll, beforeEach, describe, it } from 'vitest';
import { rule } from '../../eslint-plugin/rules/testing/assertions/test-must-use-production-runtime.mjs';

function metaType(type: string): Rule.RuleMetaData['type'] {
  return type === 'problem' || type === 'suggestion' || type === 'layout' ? type : undefined;
}

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
  return {
    ...rule,
    meta: { ...rule.meta, type: metaType(rule.meta.type) },
  };
}
