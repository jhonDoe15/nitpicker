import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveHeadPolicy, withHeadPolicyFile } from '../../preset/head-policy.mjs';
import { eslintMessageWithHint } from './eslint-hints.mjs';

const REJECT = 'Expected the Promise rejection reason to be an Error.';

afterEach(() => {
  vi.unstubAllEnvs();
});

function underRunner(runner, check) {
  const config = runner === undefined ? {} : { tools: { tests: { runner } } };
  withHeadPolicyFile(resolveHeadPolicy(config), (policyFile) => {
    vi.stubEnv('NITPICKER_POLICY', policyFile);
    check();
  });
}

function hint(ruleId, text, relativePath = 'test/a.test.ts') {
  return eslintMessageWithHint({ ruleId, text, relativePath });
}

describe('hints follow the runner the project uses', () => {
  it.each([
    ['vitest', '`vi.fn().mockRejectedValue(value)`'],
    ['jest', '`jest.fn().mockRejectedValue(value)`'],
    [
      'node',
      'an async mock that throws an `unknown` value: `mock.fn(async () => { throw value; })`',
    ],
    ['mocha', 'an async stub that throws an `unknown` value: `async () => { throw value; }`'],
  ])('names the non-Error rejection of a %s test: %s', (runner, call) => {
    underRunner(runner, () => {
      expect(hint('@typescript-eslint/prefer-promise-reject-errors', REJECT)).toBe(
        `${REJECT} In tests, reject with ${call} to use a non-Error reason.`,
      );
    });
  });

  it('keeps the rejection hint out of production code', () => {
    underRunner('jest', () => {
      expect(hint('@typescript-eslint/prefer-promise-reject-errors', REJECT, 'src/main/a.ts')).toBe(
        REJECT,
      );
    });
  });

  it.each([
    ['vitest', 'vitest/expect-expect', '`expect`', '`expect` it'],
    ['jest', 'jest/expect-expect', '`expect`', '`expect` it'],
    ['node', 'node-test/expect-expect', '`assert`', 'assert it'],
    ['mocha', 'mocha/expect-expect', '`expect` or `assert`', 'assert it'],
  ])('asks a %s test (%s) to call %s in its body', (runner, ruleId, call, again) => {
    underRunner(runner, () => {
      expect(hint(ruleId, 'Test has no assertions')).toBe(
        `Test has no assertions. Call ${call} in the test body: asserting helpers do not count, so return the value and ${again} in the test.`,
      );
    });
  });

  it.each(['jest/expect-expect', 'node-test/expect-expect', 'mocha/expect-expect'])(
    'leaves another %s message as the rule wrote it',
    (ruleId) => {
      underRunner(undefined, () => {
        expect(hint(ruleId, 'Something else')).toBe('Something else');
      });
    },
  );

  it('keeps the Vitest wording when the policy records no runner', () => {
    underRunner(undefined, () => {
      expect(hint('vitest/expect-expect', 'Test has no assertions')).toBe(
        'Test has no assertions. Call `expect` in the test body: asserting helpers do not count, so return the value and `expect` it in the test.',
      );
    });
  });

  it('tells a Vitest project with node:test files how to run them, without naming issue ids', () => {
    underRunner('vitest', () => {
      expect(hint('vitest/no-import-node-test', 'Import from vitest instead of node:test')).toBe(
        'Import from vitest instead of node:test nitpicker runs this project\'s tests with Vitest, which does not collect node:test files. Import from `vitest`, or, if the project runs its tests with node:test, set "tools.tests.runner" to "node" in nitpicker.config.json.',
      );
    });
  });
});
