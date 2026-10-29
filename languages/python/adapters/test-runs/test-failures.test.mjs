import { describe, expect, it } from 'vitest';
import { testFailureFindings, unittestFailures } from './test-failures.mjs';

describe('failing tests', () => {
  it('reads the failing unittest tests from the runner output', () => {
    expect(
      unittestFailures(
        'FAIL: test_a (tests.test_x.TestX.test_a)\nERROR: test_b (tests.test_y.TestY)\nok\n',
      ),
    ).toEqual([
      { id: 'tests.test_x.TestX.test_a', file: undefined, notRun: false },
      { id: 'tests.test_y.TestY.test_b', file: undefined, notRun: false },
    ]);
  });
  it('marks the unittest load failures as tests that did not run', () => {
    expect(unittestFailures('ERROR: test_mod (unittest.loader._FailedTest.test_mod)\n')).toEqual([
      { id: 'unittest.loader._FailedTest.test_mod', file: undefined, notRun: true },
    ]);
  });
  it('is one tests-failed tool error naming each test, the data that still ran and the modules mutation leaves out', () => {
    const [finding] = testFailureFindings({
      testRunner: 'pytest',
      testFailures: [
        { id: 'tests/test_a.py::test_x', file: 'tests/test_a.py' },
        { id: 'tests/test_a.py::test_y', file: 'tests/test_a.py' },
      ],
    });

    expect(finding).toEqual({
      tool: 'tests',
      rule: 'tests-failed',
      path: '.',
      identity: 'tests-failed',
      classification: 'tool-error',
      message: [
        'Tests fail in the head snapshot. Make each failing test pass:',
        '  tests/test_a.py::test_x',
        '  tests/test_a.py::test_y',
        'The static analyzers ran as usual; coverage and CRAP come from the tests that ran.',
        'Mutation testing (mutmut) leaves out the test modules tests/test_a.py.',
      ].join('\n'),
    });
  });
  it('lists at most 20 tests and leaves the mutation line out for unittest', () => {
    const testFailures = Array.from({ length: 23 }, (_, index) => ({
      id: `t.T.test_${String(index)}`,
    }));

    const [{ message }] = testFailureFindings({ testRunner: 'unittest', testFailures });

    expect(message.split('\n')).toEqual([
      'Tests fail in the head snapshot. Make each failing test pass:',
      ...testFailures.slice(0, 20).map(({ id }) => `  ${id}`),
      '  and 3 more',
      'The static analyzers ran as usual; coverage and CRAP come from the tests that ran.',
    ]);
  });
  it('words the base failure like every other preset', () => {
    const [finding] = testFailureFindings(
      {
        testRunner: 'pytest',
        testFailures: [{ id: 'tests/test_a.py::test_x', file: 'tests/test_a.py' }],
      },
      'base',
    );

    expect(finding.message).toBe('Tests fail on the base:\n  tests/test_a.py::test_x');
    expect(finding.rule).toBe('tests-failed');
  });
  it('is a tests-not-run tool error when no test could load', () => {
    const [finding] = testFailureFindings(
      {
        testRunner: 'pytest',
        testFailures: [{ id: 'tests/test_a.py', file: 'tests/test_a.py', notRun: true }],
      },
      'base',
    );

    expect(finding).toEqual({
      tool: 'tests',
      rule: 'tests-not-run',
      path: '.',
      identity: 'tests-not-run',
      classification: 'tool-error',
      message:
        'Tests could not run in the base snapshot. Fix what stops them from loading:\n  tests/test_a.py',
    });
  });
  it('reports nothing when every test passes', () => {
    expect(testFailureFindings({ testFailures: [] })).toEqual([]);
  });
});
