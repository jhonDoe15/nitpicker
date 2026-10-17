import { describe, expect, it } from 'vitest';
import { RULE_CASES } from './test-support/python-rule-cases.mjs';
import { createRuleChecker } from './test-support/python-rule-harness.mjs';
import { hintFor } from './rule-hints.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';

describe.skipIf(!enabled)('banned fixtures fail with the allowed form named', () => {
  const checkRuleCase = createRuleChecker();

  it.each(RULE_CASES.map((testCase) => [testCase.name, testCase]))('%s', (_name, testCase) => {
    expect(hintFor(testCase)).toBeDefined();

    const result = checkRuleCase(testCase);

    expect(result.ok, `${result.reason}; messages: ${JSON.stringify(result.messages)}`).toBe(true);
  });
});
