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
  it('reads the line and the error of each unittest failure from its traceback', () => {
    const stderr = [
      'F',
      '======================================================================',
      'FAIL: test_total (tests.test_cart.CartTest.test_total)',
      '----------------------------------------------------------------------',
      'Traceback (most recent call last):',
      '  File "/work/app/tests/test_cart.py", line 7, in test_total',
      '    self.assertEqual(total(), 4)',
      'AssertionError: 3 != 4',
      '',
      '----------------------------------------------------------------------',
      'Ran 1 test in 0.001s',
    ].join('\n');
    const failures = unittestFailures(stderr, '/work/app');

    expect(failures).toEqual([
      {
        id: 'tests.test_cart.CartTest.test_total',
        file: undefined,
        notRun: false,
        failure: { path: 'tests/test_cart.py', line: 7, message: 'AssertionError: 3 != 4' },
      },
    ]);
    expect(
      testFailureFindings({ testRunner: 'unittest', testFailures: failures })[0].message.split(
        '\n',
      )[1],
    ).toBe('  tests/test_cart.py:7 > tests.test_cart.CartTest.test_total: AssertionError: 3 != 4');
  });
  it('reads a subtest failure, the first line of a long error and the frame in the test module', () => {
    const stderr = [
      '======================================================================',
      'FAIL: test_text (tests.test_cart.CartTest.test_text) (i=1)',
      '----------------------------------------------------------------------',
      'Traceback (most recent call last):',
      '  File "/work/app/tests/test_cart.py", line 9, in test_text',
      '    self.assertEqual(label(), "a\\nc")',
      '  File "/work/app/src/cart.py", line 2, in label',
      '    raise AssertionError("a\\nb != a\\nc")',
      "AssertionError: 'a\\nb' != 'a\\nc'",
      '  a',
      '- b',
      '+ c',
      '',
      '----------------------------------------------------------------------',
    ].join('\n');

    expect(unittestFailures(stderr, '/work/app')).toEqual([
      {
        id: 'tests.test_cart.CartTest.test_text',
        file: undefined,
        notRun: false,
        failure: {
          path: 'tests/test_cart.py',
          line: 9,
          message: "AssertionError: 'a\\nb' != 'a\\nc'",
        },
      },
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
        '2 tests fail; the static analyzers ran, and coverage and CRAP come from the tests that ran. ' +
          'Fix the tests and rerun:',
        '  tests/test_a.py > test_x',
        '  tests/test_a.py > test_y',
        'Mutation testing (mutmut) leaves out the test modules tests/test_a.py.',
      ].join('\n'),
    });
  });
  it('lists at most 50 tests and leaves the mutation line out for unittest', () => {
    const testFailures = Array.from({ length: 53 }, (_, index) => ({
      id: `t.T.test_${String(index)}`,
    }));

    const [{ message }] = testFailureFindings({ testRunner: 'unittest', testFailures });

    expect(message.split('\n')).toEqual([
      '53 tests fail; the static analyzers ran, and coverage and CRAP come from the tests that ran. ' +
        'Fix the tests and rerun:',
      ...testFailures.slice(0, 50).map(({ id }) => `  ${id}`),
      '  and 3 more',
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
