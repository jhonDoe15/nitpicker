import { describe, expect, it } from 'vitest';
import { routeProblems } from '../../../../core/exceptions/test-support/route-check.mjs';
import { appendSentence } from '../../../../shared/messages/exception-sentence.mjs';
import { eslintRoute } from '../../adapters/hints/eslint-routes.mts';
import { checkFailureMessageCase, lintFixture, projectRelative } from './test-support/harness.mts';
import type { FailureMessageCase } from './test-support/typed/case-types.mts';
import { allFailureMessageCases } from './test-support/cases.mts';

const failureMessageCases = await allFailureMessageCases();

function caseWhere(matches: (testCase: FailureMessageCase) => boolean): FailureMessageCase {
  const found = failureMessageCases.find(matches);
  if (found === undefined) {
    throw new Error('no failure message case matches');
  }
  return found;
}

describe('banned forms name the allowed form in their failure message', () => {
  it.each(failureMessageCases.map((testCase) => [testCase.name, testCase] as const))(
    '%s',
    (_name, testCase) => {
      const result = checkFailureMessageCase(testCase);
      expect(
        result.ok,
        `${result.reason ?? ''}; messages: ${JSON.stringify(result.messages)}`,
      ).toBe(true);
    },
  );

  it.each(failureMessageCases.map((testCase) => [testCase.name, testCase] as const))(
    '%s ends with an exception route that the preset accepts and that lifts it',
    (_name, { config, filename = 'src/fixture.ts', banned }) => {
      const path = projectRelative(filename);
      const problems = lintFixture({ config, filename, code: banned }).flatMap((lint) => {
        const route = lint.ruleId === null ? undefined : eslintRoute({ rule: lint.ruleId, path });
        const finding = { tool: 'eslint', rule: lint.ruleId, path };
        return route === undefined
          ? []
          : routeProblems(finding, appendSentence(lint.message, route), 'typescript').map(
              (problem) => `${String(lint.ruleId)}: ${problem}`,
            );
      });

      expect(problems).toEqual([]);
    },
  );

  it('coverage ignore comment names testing the code', () => {
    const base = caseWhere(({ name }) => name.startsWith('ts-nocheck'));
    const result = checkFailureMessageCase({
      ...base,
      banned: '/* istanbul ignore next */\nconst value = 1;',
      allowed: 'Test this code instead',
    });
    expect(result.ok, result.reason).toBe(true);
  });

  it('rejects a fixture that does not fail', () => {
    const base = caseWhere(() => true);
    const result = checkFailureMessageCase({ ...base, banned: 'const value = 1;' });
    expect(result.ok).toBe(false);
  });

  it('rejects a message that does not name the allowed form', () => {
    const base = caseWhere(() => true);
    const result = checkFailureMessageCase({ ...base, allowed: 'a form the message never says' });
    expect(result.ok).toBe(false);
  });
});
