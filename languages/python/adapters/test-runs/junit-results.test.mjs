import { describe, expect, it } from 'vitest';
import { failedTests, failingModules, parseJunit } from './junit-results.mjs';

const REPORT = `<?xml version="1.0" encoding="utf-8"?>
<testsuites><testsuite name="pytest">
<testcase classname="tests.test_a.TestA" name="test_ok[1-2]" file="tests/test_a.py" line="4" time="1,234.5"/>
<testcase classname="tests.test_a" name="test_bad" file="tests/test_a.py" line="9" time="0.2"><failure message="boom"/></testcase>
<testcase classname="tests.test_b" name="test_skip" file="tests/test_b.py" line="1" time="0"><skipped/></testcase>
<testcase classname="" name="tests.test_c" time="0.1"><error message="collection failure"/></testcase>
</testsuite></testsuites>`;

describe('pytest JUnit results', () => {
  it('reads each case with its file, 1-based line, class, function and outcome', () => {
    const [ok, bad, skipped, collection] = parseJunit(REPORT);

    expect(ok).toEqual({
      file: 'tests/test_a.py',
      qualifiedClass: 'tests.test_a.TestA',
      line: 5,
      className: 'TestA',
      name: 'test_ok[1-2]',
      functionName: 'test_ok',
      id: 'tests/test_a.py::TestA::test_ok[1-2]',
      seconds: expect.closeTo(1234.5, 10),
      outcome: 'passed',
    });
    expect(bad).toEqual({
      file: 'tests/test_a.py',
      qualifiedClass: 'tests.test_a',
      line: 10,
      className: '',
      name: 'test_bad',
      functionName: 'test_bad',
      id: 'tests/test_a.py::test_bad',
      seconds: expect.closeTo(0.2, 10),
      outcome: 'failed',
    });
    expect(skipped.outcome).toBe('skipped');
    expect(collection).toEqual({
      file: 'tests/test_c.py',
      qualifiedClass: '',
      line: undefined,
      className: '',
      name: undefined,
      functionName: undefined,
      id: 'tests/test_c.py',
      seconds: expect.closeTo(0.1, 10),
      outcome: 'failed',
    });
  });
  it('names the failed tests and the modules they are in, once each', () => {
    const cases = parseJunit(REPORT);

    expect(failedTests(cases).map(({ id }) => id)).toEqual([
      'tests/test_a.py::test_bad',
      'tests/test_c.py',
    ]);
    expect(failingModules(cases)).toEqual(['tests/test_a.py', 'tests/test_c.py']);
  });
  it('reads the marks the timing plugin recorded for each case', () => {
    const [marked, plain] = parseJunit(
      '<testsuite><testcase classname="t" name="test_x[1]" file="t.py" time="1"><properties><property name="nitpicker_marks" value="integration parametrize"/></properties></testcase><testcase classname="t" name="test_y" file="t.py" time="1"/></testsuite>',
    );

    expect([marked.marks, plain.marks]).toEqual([['integration', 'parametrize'], undefined]);
  });
  it('reads a single testsuite root', () => {
    expect(
      parseJunit(
        '<testsuite><testcase classname="t" name="test_x" file="t.py" time="1"/></testsuite>',
      ),
    ).toHaveLength(1);
  });
});
