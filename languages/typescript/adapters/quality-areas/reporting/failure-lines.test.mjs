import { describe, expect, it } from 'vitest';
import { RUNNER_NAMES } from '../../../preset/test-runner/runners.mjs';
import { formatTestFailures } from './test-report.mjs';
import { assertionDetails } from './failure-lines.mjs';

const headline = '1 test fails; coverage, CRAP and mutation were skipped. Fix the tests and rerun:';

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

describe('the line of a failing assertion', () => {
  const lineOf = (frame) =>
    assertionDetails(
      { failureMessages: [`Error: no\n    at helper (/p/src/a.ts:3:1)\n${frame}`] },
      { testFile: '/p/test/a b.test.ts', projectRoot: '/p' },
    ).line;

  it.each([
    ['a raw path with a space', '    at /p/test/a b.test.ts:12:5'],
    ['a call site with a space', '    at fn (/p/test/a b.test.ts:12:5)'],
    ['a file URL', '    at file:///p/test/a%20b.test.ts:12:5'],
    ['a path relative to the project with a query', '    at fn (test/a b.test.ts?v=3:12:5)'],
  ])('comes from %s', (_, frame) => {
    expect(lineOf(frame)).toBe(12);
  });

  it('is left out when no frame is in the test file', () => {
    expect(lineOf('    at other (/p/test/other.test.ts:12:5)')).toBeUndefined();
  });
});
