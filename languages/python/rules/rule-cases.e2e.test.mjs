import { describe, expect, it } from 'vitest';
import { RULE_CASES } from './fixtures/cases.mjs';
import { checkRuleCase } from './fixtures/harness.mjs';

// Runs every banned and allowed fixture through the real tools (ruff, python3, mypy, pyright from
// the PATH), so it only runs with NITPICKER_PYTHON_E2E=1 (`npm run test:python`).

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';

describe.skipIf(!enabled)('banned fixtures fail with the allowed form named', () => {
  it.each(RULE_CASES.map((testCase) => [testCase.name, testCase]))('%s', (_name, testCase) => {
    const result = checkRuleCase(testCase);

    expect(result.ok, `${result.reason}; messages: ${JSON.stringify(result.messages)}`).toBe(true);
  });
});
