import { describe, expect, it } from 'vitest';
import { testFailureFindings, unittestFailures } from './test-failures.mjs';

describe('failing tests', () => {
  it('reads the failing unittest tests from the runner output', () => {
    expect(
      unittestFailures(
        'FAIL: test_a (tests.test_x.TestX.test_a)\nERROR: test_b (tests.test_y.TestY)\nok\n',
      ),
    ).toEqual([
      { id: 'tests.test_x.TestX.test_a', file: undefined },
      { id: 'tests.test_y.TestY.test_b', file: undefined },
    ]);
  });
  it('is one tests-failed tool error naming each test, the data that still ran and the modules mutation leaves out', () => {
    const [finding] = testFailureFindings(
      {
        testRunner: 'pytest',
        testFailures: [
          { id: 'tests/test_a.py::test_x', file: 'tests/test_a.py' },
          { id: 'tests/test_a.py::test_y', file: 'tests/test_a.py' },
        ],
      },
      'base',
    );

    expect(finding).toEqual({
      tool: 'tests',
      rule: 'tests-failed',
      path: '.',
      identity: 'tests-failed',
      classification: 'tool-error',
      message: [
        'Tests fail in the base snapshot. Make each failing test pass:',
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
  it('reports nothing when every test passes', () => {
    expect(testFailureFindings({ testFailures: [] })).toEqual([]);
  });
});
