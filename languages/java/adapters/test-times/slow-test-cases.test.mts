import { describe, expect, it } from 'vitest';
import { testCasesOf } from './slow-tests.mts';

describe('testCasesOf', () => {
  it('reads Gradle and Surefire testcases with their time in seconds', () => {
    const xml =
      '<testsuites><testsuite name="shop.OrderTest"><testcase name="[1] 1" classname="shop.OrderTest" time="0.25"/><testcase name="positive(int)[2]" classname="shop.OrderTest" time="1,234.5"/></testsuite></testsuites>';

    const cases = testCasesOf(xml, 'test');

    expect(cases.map(({ task, className, name }) => ({ task, className, name }))).toEqual([
      { task: 'test', className: 'shop.OrderTest', name: '[1] 1' },
      { task: 'test', className: 'shop.OrderTest', name: 'positive(int)[2]' },
    ]);
    expect(cases[0]?.seconds).toBeCloseTo(0.25);
    expect(cases[1]?.seconds).toBeCloseTo(1234.5);
  });
  it('does not time a case that failed and passed on a rerun', () => {
    const xml =
      '<testsuite name="shop.OrderTest"><testcase name="a" classname="shop.OrderTest" time="9"><flakyFailure message="no"/></testcase><testcase name="b" classname="shop.OrderTest" time="1"/></testsuite>';

    expect(testCasesOf(xml, 'test').map(({ name }) => name)).toEqual(['b']);
  });
});
