import { mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { failedCases, failingTestsError, freshReports, moduleName } from './test-failures.mjs';

const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function directory() {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-test-failures-'));
  roots.push(root);
  return root;
}

const SUITE = `<testsuite name="shop.CartTest">
  <testcase classname="shop.CartTest" name="adds"><failure message="expected: 4&#10;but was: 3"/></testcase>
  <testcase classname="shop.CartTest" name="empties"><error type="java.lang.IllegalStateException"/></testcase>
  <testcase classname="shop.CartTest" name="passes"/>
</testsuite>`;

describe('failedCases', () => {
  it('drops the parameter list and the exception class from a JUnit 5 case', () => {
    const root = directory();
    const file = path.join(root, 'TEST-demo.GreeterTest.xml');
    writeFileSync(
      file,
      `<testsuite name="demo.GreeterTest"><testcase classname="demo.GreeterTest" name="greetsByName()"><failure message="org.opentest4j.AssertionFailedError: expected: &lt;Hi&gt; but was: &lt;Hello&gt;"/></testcase></testsuite>`,
    );

    expect(failedCases(file)).toEqual([
      'demo.GreeterTest.greetsByName: expected: <Hi> but was: <Hello>',
    ]);
  });

  it('names each failing or erroring test with the first line of its message', () => {
    const root = directory();
    writeFileSync(path.join(root, 'TEST-shop.CartTest.xml'), SUITE);

    expect(failedCases(path.join(root, 'TEST-shop.CartTest.xml'))).toEqual([
      'shop.CartTest.adds: expected: 4',
      'shop.CartTest.empties: java.lang.IllegalStateException',
    ]);
  });
});

describe('freshReports', () => {
  it('lists only the JUnit reports written since the run started', () => {
    const root = directory();
    for (const name of ['TEST-a.xml', 'TEST-b.xml', 'notes.xml']) {
      writeFileSync(path.join(root, name), SUITE);
    }
    const old = new Date(Date.now() - 60_000);
    utimesSync(path.join(root, 'TEST-b.xml'), old, old);

    expect(freshReports(root, Date.now() - 30_000)).toEqual([path.join(root, 'TEST-a.xml')]);
    expect(freshReports(path.join(root, 'missing'), 0)).toEqual([]);
  });
});

describe('failingTestsError', () => {
  it('lists at most ten failing tests and counts the rest', () => {
    const tests = Array.from({ length: 12 }, (_, index) => `shop.T.t${String(index)}: no`);

    expect(failingTestsError('/repo', [{ module: '.', tests }]).message.split('\n')).toEqual([
      'Tests fail in /repo; nitpicker needs a passing test suite for coverage and mutation testing:',
      ...tests.slice(0, 10).map((test) => `  ${test}`),
      '  and 2 more',
    ]);
  });

  it('lists the tests of every module', () => {
    const error = failingTestsError('/repo', [
      { module: '.', tests: ['shop.T.a: no'] },
      { module: 'core', tests: ['shop.U.b: no'] },
    ]);

    expect(error.message.split('\n').slice(1)).toEqual(['  shop.T.a: no', '  shop.U.b: no']);
  });

  it('keeps the failures on the error without changing how it compares', () => {
    const failures = [{ module: 'core', tests: ['shop.T.t: no'] }];
    const error = failingTestsError('/repo', failures);

    expect(error.failures).toBe(failures);
    expect(Object.keys(error)).toEqual([]);
  });
});

describe('moduleName', () => {
  it('is the dot for the root project and the directory for a module', () => {
    expect([moduleName(''), moduleName('core')]).toEqual(['.', 'core']);
  });
});
