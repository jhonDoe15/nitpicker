import { describe, expect, it } from 'vitest';
import { RUNNER_NAMES } from '../../../preset/test-runner/runners.mjs';
import { formatTestFailures } from './test-report.mjs';

const headline =
  '1 test fails, so coverage, CRAP and mutation were skipped. Fix the tests and rerun:';

function messageFor(failureMessage, runnerName = RUNNER_NAMES.vitest) {
  return formatTestFailures(
    {
      numFailedTests: 1,
      testResults: [
        {
          name: '/p/test/panel.test.tsx',
          assertionResults: [
            { fullName: 'panel', status: 'failed', failureMessages: [failureMessage] },
          ],
        },
      ],
    },
    '/p',
    { runnerName },
  );
}

describe('a Vitest failure from a missing component test setup', () => {
  it.each([
    [
      'ReferenceError: document is not defined',
      "Hint: the test runs without a DOM. Set `environment: 'jsdom'` under `test` in the Vitest config.",
    ],
    [
      'Error: Invalid Chai property: toBeInTheDocument',
      'Hint: the jest-dom matchers are not registered. ' +
        "Add `import '@testing-library/jest-dom/vitest'` to a file listed in `test.setupFiles`.",
    ],
    [
      'ReferenceError: afterEach is not defined',
      'Hint: the test globals are off. Set `globals: true` under `test` in the Vitest config, ' +
        'which also lets Testing Library clean up after each test.',
    ],
  ])('names the setup line for %s', (failure, hint) => {
    expect(messageFor(failure).split('\n')).toEqual([
      headline,
      `  test/panel.test.tsx > panel: ${failure}`,
      hint,
    ]);
  });

  it('adds no hint to an ordinary assertion failure', () => {
    expect(messageFor('AssertionError: expected 500 to be 400').split('\n')).toEqual([
      headline,
      '  test/panel.test.tsx > panel: AssertionError: expected 500 to be 400',
    ]);
  });
});

describe('a failure under another runner', () => {
  it('gets no Vitest setup hint', () => {
    expect(messageFor('ReferenceError: document is not defined', RUNNER_NAMES.jest)).toBe(
      `${headline}\n  test/panel.test.tsx > panel: ReferenceError: document is not defined`,
    );
  });
});
