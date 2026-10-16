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
    ['node', '`mock.fn(async () => { throw value; })`'],
    ['mocha', '`async () => { throw value; }`'],
  ])('names the non-Error rejection of a %s test with %s', (runner, call) => {
    underRunner(runner, () => {
      const message = hint('@typescript-eslint/prefer-promise-reject-errors', REJECT);

      expect(message).toContain(`In tests, reject with `);
      expect(message).toContain(call);
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
      expect(hint('vitest/expect-expect', 'Test has no assertions')).toContain('`expect` it');
    });
  });

  it('tells a Vitest project with node:test files how to run them, without naming issue ids', () => {
    underRunner('vitest', () => {
      const message = hint('vitest/no-import-node-test', 'Import from vitest instead of node:test');

      expect(message).toContain('Import from `vitest`');
      expect(message).toContain('"tools.tests.runner" to "node"');
      expect(message).not.toMatch(/#\d+/u);
    });
  });
});
