import { describe, expect, it } from 'vitest';
import { fieldOf, fieldsOf } from '../../../../shared/values/readers.mts';
import { failedTests, failingModules, parseJunit as parsedJunit } from './junit-results.mts';

function parseJunit(xml: string): Readonly<Record<string, unknown>>[] {
  return parsedJunit(xml).map(fieldsOf);
}

const REPORT = `<?xml version="1.0" encoding="utf-8"?>
<testsuites><testsuite name="pytest">
<testcase classname="tests.test_a.TestA" name="test_ok[1-2]" file="tests/test_a.py" line="4" time="1,234.5"/>
<testcase classname="tests.test_a" name="test_bad" file="tests/test_a.py" line="9" time="0.2"><failure message="boom"/></testcase>
<testcase classname="tests.test_b" name="test_skip" file="tests/test_b.py" line="1" time="0"><skipped/></testcase>
<testcase classname="" name="tests.test_c" time="0.1"><error message="collection failure"/></testcase>
</testsuite></testsuites>`;

const LONG: unknown = expect.closeTo(1234.5, 10);
const SHORT: unknown = expect.closeTo(0.2, 10);
const BRIEF: unknown = expect.closeTo(0.1, 10);

describe('pytest JUnit results', () => {
  it('reads the line of the failing assertion and the message of a failed case', () => {
    const [failed] = parseJunit(
      `<testsuite><testcase classname="tests.test_cart" name="test_total" file="tests/test_cart.py" line="3">` +
        `<failure message="assert 3 == 4&#10; +  where 3 = total()">def test_total():&#10;&gt;       assert total() == 4&#10;` +
        `E       assert 3 == 4&#10;&#10;src/cart.py:2: in total&#10;tests/test_cart.py:6: AssertionError</failure></testcase></testsuite>`,
    );

    expect(fieldOf(failed, 'failure')).toEqual({ line: 6, message: 'assert 3 == 4' });
  });

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
      seconds: LONG,
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
      seconds: SHORT,
      outcome: 'failed',
      failure: { message: 'boom' },
    });
    expect(fieldOf(skipped, 'outcome')).toBe('skipped');
    expect(collection).toEqual({
      file: 'tests/test_c.py',
      qualifiedClass: '',
      line: undefined,
      className: '',
      name: undefined,
      functionName: undefined,
      id: 'tests/test_c.py',
      seconds: BRIEF,
      outcome: 'failed',
      failure: { message: 'collection failure' },
    });
  });
  it('names the failed tests and the modules they are in, once each', () => {
    const cases = parsedJunit(REPORT);

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

    expect([fieldOf(marked, 'marks'), fieldOf(plain, 'marks')]).toEqual([
      ['integration', 'parametrize'],
      undefined,
    ]);
  });
  it('reads a single testsuite root', () => {
    expect(
      parseJunit(
        '<testsuite><testcase classname="t" name="test_x" file="t.py" time="1"/></testsuite>',
      ),
    ).toHaveLength(1);
  });
});
