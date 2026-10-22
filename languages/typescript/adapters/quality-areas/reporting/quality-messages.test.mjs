import { describe, expect, it } from 'vitest';
import { MESSAGES } from '../../../../../shared/policy.mjs';
import { mutationSkipFor } from '../runners/mutation.mjs';
import { normalizeCrap, normalizeMutation, crapUnknownMessage } from './tests.mjs';
import {
  coverageFailureFindings,
  formatTestFailures as formatVitestFailures,
} from './test-report.mjs';
import {
  timeoutText,
  unhandledErrors,
  unhandledErrorText,
  withSnapshotAdvice,
} from './failure-lines.mjs';

const rule = '⎯⎯⎯⎯⎯⎯⎯';
const unhandledOutput = [
  `${rule} Unhandled Errors ${rule}`,
  '',
  'Vitest caught 1 unhandled error during the test run.',
  '',
  `${rule} Unhandled Rejection ${rule}`,
  "AssertionError: expected 'user-2' to be 'nope' // Object.is equality",
  ' ❯ src/t.test.ts:3:60',
  '',
  'This error originated in "src/t.test.ts" test file. It does not mean the error was thrown inside.',
  rule,
].join('\n');
const timedOut = {
  fullName: 'times out',
  status: 'failed',
  duration: 304.96,
  failureMessages: ['Error: STACK_TRACE_ERROR\n    at task (chunk.js:1:1)'],
};

describe('test timeout text', () => {
  it('names the timeout and the usual causes instead of the stack-trace marker', () => {
    expect(timeoutText(timedOut)).toBe(
      'Test timed out after 305 ms. A fake clock that was never restored (`vi.useRealTimers()` in `afterEach`), a promise that never settles or a long wait is the usual cause.',
    );
  });

  it('leaves assertion failures to their own first line', () => {
    expect(
      timeoutText({ failureMessages: ['AssertionError: expected 1 to be 2'] }),
    ).toBeUndefined();
    expect(timeoutText({})).toBeUndefined();
  });

  it('omits the duration when the report has none', () => {
    expect(timeoutText({ failureMessages: ['Error: STACK_TRACE_ERROR'] })).toBe(
      'Test timed out. A fake clock that was never restored (`vi.useRealTimers()` in `afterEach`), a promise that never settles or a long wait is the usual cause.',
    );
  });

  it('is what the failing test list shows', () => {
    const message = formatVitestFailures(
      {
        numFailedTests: 1,
        testResults: [{ name: '/p/src/t.test.ts', assertionResults: [timedOut] }],
      },
      '/p',
    );

    expect(message).toBe(
      '1 test fails, so coverage, CRAP and mutation were skipped. Fix the tests and rerun:\n  src/t.test.ts > times out: Test timed out after 305 ms. A fake clock that was never restored (`vi.useRealTimers()` in `afterEach`), a promise that never settles or a long wait is the usual cause.',
    );
  });
});

describe('snapshot failures', () => {
  it('say that a new snapshot has to be committed', () => {
    expect(withSnapshotAdvice('Error: Snapshot `greet > hello 1` mismatched')).toBe(
      'Error: Snapshot `greet > hello 1` mismatched. A new snapshot must be committed: run `vitest -u` locally and commit the .snap file.',
    );
    expect(withSnapshotAdvice('AssertionError: expected 1 to be 2')).toBe(
      'AssertionError: expected 1 to be 2',
    );
  });

  it('show in the failing test list', () => {
    const message = formatVitestFailures(
      {
        numFailedTests: 1,
        testResults: [
          {
            name: '/p/test/a.test.ts',
            assertionResults: [
              {
                fullName: 'snap',
                status: 'failed',
                failureMessages: [
                  'Error: Snapshot `snap 1` mismatched\n  - Expected\n  + Received',
                ],
              },
            ],
          },
        ],
      },
      '/p',
    );

    expect(message).toBe(
      '1 test fails, so coverage, CRAP and mutation were skipped. Fix the tests and rerun:\n  test/a.test.ts > snap: Error: Snapshot `snap 1` mismatched. A new snapshot must be committed: run `vitest -u` locally and commit the .snap file.',
    );
  });
});

describe('unhandled errors in the Vitest output', () => {
  it('reads the kind, the first message line and the originating test file', () => {
    expect(unhandledErrors(unhandledOutput)).toEqual([
      {
        kind: 'unhandled rejection',
        message: "AssertionError: expected 'user-2' to be 'nope' // Object.is equality",
        file: 'src/t.test.ts',
      },
    ]);
  });

  it('finds nothing in output without the sections', () => {
    expect(unhandledErrors('Unhandled Rejection: boom')).toEqual([]);
    expect(unhandledErrors(undefined)).toEqual([]);
  });

  it('cuts a long message and counts further errors', () => {
    const long = 'x'.repeat(250);
    const output = `${rule} Uncaught Exception ${rule}\n${long}\n${rule} Unhandled Error ${rule}\nsecond`;
    const errors = unhandledErrors(output);

    expect(errors.map(({ kind }) => kind)).toEqual(['uncaught exception', 'unhandled error']);
    expect(errors[0].message).toBe(`${'x'.repeat(200)}…`);
    expect(unhandledErrorText(errors)).toBe(
      `Vitest caught an uncaught exception: ${'x'.repeat(200)}… (and 1 more). Await or return the promise in the test so its failure fails the test, then rerun; coverage, CRAP and mutation were skipped.`,
    );
  });

  it('becomes a tool error that names the file, the message and the fix', () => {
    const findings = coverageFailureFindings(
      { analyzerName: 'coverage', projectRoot: '/p' },
      {
        report: { numFailedTests: 0, testResults: [] },
        result: { status: 1, stdout: '', stderr: unhandledOutput },
        runnerName: 'Vitest',
      },
    );

    expect(findings).toEqual([
      {
        tool: 'coverage',
        rule: 'tests-not-run',
        path: 'src/t.test.ts',
        identity: 'tests-not-run',
        message:
          "Vitest caught an unhandled rejection from src/t.test.ts: AssertionError: expected 'user-2' to be 'nope' // Object.is equality. Await or return the promise in the test so its failure fails the test, then rerun; coverage, CRAP and mutation were skipped.",
        classification: 'tool-error',
      },
    ]);
  });
});

describe('failures of a base snapshot', () => {
  const failedReport = {
    numFailedTests: 2,
    testResults: [
      {
        name: '/p/src/a.test.ts',
        assertionResults: [
          {
            fullName: 'adds',
            status: 'failed',
            failureMessages: ['AssertionError: expected 1 to be 2'],
          },
          { fullName: 'subtracts', status: 'failed', failureMessages: ['Error: boom'] },
        ],
      },
    ],
  };
  const findingsOf = ({ report, snapshot, runnerName }) =>
    coverageFailureFindings(
      { analyzerName: 'coverage', projectRoot: '/p', snapshot },
      { report, result: { status: 1, stdout: '', stderr: '' }, runnerName },
    );

  it.each(['Vitest', 'Jest', 'Mocha', 'node:test'])(
    'is a tests-failed note naming the failing tests for %s',
    (runnerName) => {
      expect(findingsOf({ report: failedReport, snapshot: 'base', runnerName })).toEqual([
        {
          tool: 'coverage',
          rule: 'tests-failed',
          path: 'src/a.test.ts',
          identity: 'tests-failed',
          message: [
            'Tests fail on the base:',
            '  src/a.test.ts > adds: AssertionError: expected 1 to be 2',
            '  src/a.test.ts > subtracts: Error: boom',
          ].join('\n'),
          classification: 'tool-error',
        },
      ]);
    },
  );

  it('keeps the instruction wording for the head', () => {
    const [finding] = findingsOf({ report: failedReport, snapshot: 'head', runnerName: 'Jest' });

    expect(finding.message.split('\n')[0]).toBe(
      '2 tests fail, so coverage, CRAP and mutation were skipped. Fix the tests and rerun:',
    );
  });

  it('is tests-not-run when a test file could not be loaded', () => {
    const report = {
      numFailedTests: 0,
      testResults: [
        {
          name: '/p/src/a.test.ts',
          status: 'failed',
          message: 'Cannot find module',
          assertionResults: [],
        },
      ],
    };

    const [finding] = findingsOf({ report, snapshot: 'base', runnerName: 'Vitest' });

    expect([finding.rule, finding.message]).toEqual([
      'tests-not-run',
      [
        '1 test fails, so coverage, CRAP and mutation were skipped. Fix the tests and rerun:',
        '  src/a.test.ts > could not run: Cannot find module',
      ].join('\n'),
    ]);
  });

  it('stays an error without a named failing test', () => {
    expect(() =>
      findingsOf({
        report: { numFailedTests: 0, testResults: [] },
        snapshot: 'base',
        runnerName: 'Jest',
      }),
    ).toThrow('Jest exited 1 without naming a failing test');
  });
});

describe('mutation skip', () => {
  it('treats a crashed initial test run like failing tests', () => {
    expect(mutationSkipFor('Something went wrong in the initial test run\n at x')).toEqual({
      rule: 'tests-failed-skipped',
      message: 'mutation skipped: tests fail (see coverage findings)',
    });
  });
});

describe('unknown coverage text', () => {
  it('suggests composition-root wiring only for composition-root files', () => {
    expect(crapUnknownMessage('src/main/composition-root.ts')).toBe(MESSAGES.crapCoverageUnknown);
    expect(crapUnknownMessage('src/server.ts')).toBe(MESSAGES.crapCoverageUnknown);
    expect(crapUnknownMessage('src/main/features/greeting/domain/greet.ts')).toBe(
      '{name} has unknown coverage and no CRAP score: no test runs it. Add a test that calls it.',
    );
  });

  it('reaches the TypeScript CRAP findings', () => {
    const report = (source) => ({
      functions: [{ source, function: 'greet', lines: { start: 1, end: 3 }, crap: null }],
    });

    const [domain] = normalizeCrap(report('src/main/features/greeting/domain/greet.ts'), 'crap');
    const [root] = normalizeCrap(report('src/main/composition-root.ts'), 'crap');

    expect(domain.message).toBe(
      'greet has unknown coverage and no CRAP score: no test runs it. Add a test that calls it.',
    );
    expect(root.message).toBe(
      'greet has unknown coverage and no CRAP score: no test runs it. Add a test that calls it; for inline composition-root wiring, move it to a named function in adapters/ and test that.',
    );
  });
});

describe('mutants hidden by a Stryker comment', () => {
  const report = {
    files: {
      'src/classify.ts': {
        mutants: [
          {
            status: 'Ignored',
            mutatorName: 'ConditionalExpression',
            replacement: 'true',
            location: { start: { line: 4, column: 7 } },
          },
          { status: 'Killed', mutatorName: 'StringLiteral', location: { start: { line: 5 } } },
        ],
      },
    },
  };

  it('are enforceable findings that name the comment as the thing to remove', () => {
    const [ignored] = normalizeMutation(report, 'mutation').filter(
      ({ rule: id }) => id === 'mutant-ignored',
    );

    expect(ignored.classification).toBe('enforceable');
    expect(ignored.message).toBe(
      'Ignored ConditionalExpression at column 7: an ignore comment hides this code from mutation testing. Remove the comment and test the code; an ignore comment is not an exception route. If this is intended, add {"rule":"mutant-ignored","paths":["src/classify.ts"],"reason":"..."} to "exceptions" in nitpicker.config.json.',
    );
  });
});
