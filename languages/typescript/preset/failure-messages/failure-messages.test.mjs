import { describe, expect, it } from 'vitest';
import { checkFailureMessageCase } from './harness.mjs';
import { failureMessageCases } from './cases.mjs';

describe('banned forms name the allowed form in their failure message', () => {
  it.each(failureMessageCases.map((testCase) => [testCase.name, testCase]))(
    '%s',
    (_name, testCase) => {
      const result = checkFailureMessageCase(testCase);
      expect(result.ok, `${result.reason}; messages: ${JSON.stringify(result.messages)}`).toBe(
        true,
      );
    },
  );

  it('rejects a fixture that does not fail', () => {
    const [base] = failureMessageCases;
    const result = checkFailureMessageCase({ ...base, banned: 'const value = 1;' });
    expect(result.ok).toBe(false);
  });

  it('rejects a message that does not name the allowed form', () => {
    const [base] = failureMessageCases;
    const result = checkFailureMessageCase({ ...base, allowed: 'a form the message never says' });
    expect(result.ok).toBe(false);
  });
});
