import { mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  failedCaseEntries,
  failedCases,
  failingTestsError,
  freshReports,
  moduleName,
} from './test-failures.mjs';

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

describe('failedCaseEntries', () => {
  const caseWith = (classname, failure) =>
    `<testsuite name="${classname}"><testcase classname="${classname}" name="adds()">${failure}</testcase></testsuite>`;
  const detailsOf = (xml) => {
    const file = path.join(directory(), 'TEST-x.xml');
    writeFileSync(file, xml);
    return failedCaseEntries(file).map(({ detail }) => detail);
  };

  it('names the line of the first test-class frame, inside a lambda too', () => {
    const failure =
      '<failure message="org.opentest4j.AssertionFailedError: expected: &lt;4&gt; but was: &lt;3&gt;">' +
      'org.opentest4j.AssertionFailedError: expected: &lt;4&gt; but was: &lt;3&gt;\n' +
      '\tat org.junit.jupiter.api.AssertionUtils.fail(AssertionUtils.java:151)\n' +
      '\tat demo.core.AdderTest.lambda$adds$0(AdderTest.java:14)\n' +
      '\tat demo.core.AdderTest.adds(AdderTest.java:12)\n' +
      '</failure>';

    expect(detailsOf(caseWith('demo.core.AdderTest', failure))).toEqual([
      {
        name: 'demo.core.AdderTest.adds',
        message: 'expected: <4> but was: <3>',
        file: 'demo/core/AdderTest.java',
        line: 14,
        expected: '4',
        received: '3',
      },
    ]);
  });

  it('reads frames that Gradle prefixes with a class loader or module', () => {
    const failure =
      '<failure message="boom">java.lang.AssertionError: boom\n' +
      '\tat java.base@21.0.12/java.lang.reflect.Method.invoke(Method.java:580)\n' +
      '\tat app//demo.GreeterTest.greets(GreeterTest.java:22)\n' +
      '</failure>';

    expect(detailsOf(caseWith('demo.GreeterTest', failure))).toEqual([
      { name: 'demo.GreeterTest.adds', message: 'boom', file: 'demo/GreeterTest.java', line: 22 },
    ]);
  });

  it.each([
    [
      'AssertJ',
      'java.lang.AssertionError: &#10;expected: 4&#10; but was: 3',
      'expected: 4',
      '4',
      '3',
    ],
    [
      'Hamcrest',
      'java.lang.AssertionError: &#10;Expected: is &lt;4&gt;&#10;     but: was &lt;3&gt;',
      'Expected: is <4>',
      'is <4>',
      'was <3>',
    ],
    [
      'kotlin.test',
      'java.lang.AssertionError: Expected &lt;4&gt;, actual &lt;3&gt;.',
      'Expected <4>, actual <3>.',
      '4',
      '3',
    ],
  ])(
    'reads the expected and received values of a %s message',
    (_, message, first, expected, received) => {
      const failure = `<failure message="${message}">trace\n\tat shop.CartTest.adds(CartTest.kt:7)\n</failure>`;

      expect(detailsOf(caseWith('shop.CartTest', failure))).toEqual([
        {
          name: 'shop.CartTest.adds',
          message: first,
          file: 'shop/CartTest.kt',
          line: 7,
          expected,
          received,
        },
      ]);
    },
  );

  it('reads the stack of a rerun from its stackTrace element', () => {
    const failure =
      '<flakyFailure message="boom" type="java.lang.AssertionError">' +
      '<stackTrace>java.lang.AssertionError: boom\n\tat shop.CartTest.adds(CartTest.java:9)</stackTrace>' +
      '</flakyFailure>';

    expect(detailsOf(caseWith('shop.CartTest', failure))).toEqual([
      {
        name: 'shop.CartTest.adds',
        message:
          'failed, then passed on a rerun (fix the flaky test; nitpicker counts a rerun as a failure): boom',
        file: 'shop/CartTest.java',
        line: 9,
      },
    ]);
  });

  it('reads the values of an AssertJ comparison', () => {
    const failure =
      '<failure message="&#10;Expecting actual:&#10;  &quot;b&quot;&#10;to be equal to:&#10;  &quot;a&quot;&#10;but was not.">' +
      'at shop.CartTest.adds(CartTest.java:4)</failure>';

    expect(detailsOf(caseWith('shop.CartTest', failure))).toEqual([
      {
        name: 'shop.CartTest.adds',
        message: 'Expecting actual:',
        file: 'shop/CartTest.java',
        line: 4,
        expected: '"a"',
        received: '"b"',
      },
    ]);
  });

  it('lists each failure with its location and the values the message leaves out', () => {
    const error = failingTestsError([
      {
        module: '.',
        tests: ['shop.CartTest.adds: expected: 4'],
        details: [
          {
            name: 'shop.CartTest.adds',
            message: 'expected: 4',
            file: 'shop/CartTest.java',
            line: 7,
            expected: '4',
            received: '3',
          },
        ],
      },
    ]);

    expect(error.message.split('\n')).toEqual([
      '1 test fails; the build stopped, so no other check ran. Fix the tests and rerun:',
      '  shop/CartTest.java:7 > shop.CartTest.adds: expected: 4',
      '    expected: 4',
      '    received: 3',
    ]);
  });
});

describe('failedCases with reruns', () => {
  function failuresOf(body) {
    const root = directory();
    const file = path.join(root, 'TEST-shop.CartTest.xml');
    writeFileSync(file, `<testsuite name="shop.CartTest">${body}</testsuite>`);
    return failedCases(file);
  }

  it.each([
    [
      'a Surefire rerun',
      `<testcase classname="shop.CartTest" name="adds()">
        <flakyFailure message="java.lang.AssertionError: expected: 4&#10;but was: 3"
          type="java.lang.AssertionError"><stackTrace/></flakyFailure>
        <system-out/>
      </testcase>`,
      'shop.CartTest.adds: failed, then passed on a rerun (fix the flaky test; nitpicker counts a rerun as a failure): expected: 4',
    ],
    [
      'a flaky error',
      `<testcase classname="shop.CartTest" name="empties">
        <flakyError type="java.lang.IllegalStateException"><stackTrace/></flakyError>
      </testcase>`,
      'shop.CartTest.empties: failed, then passed on a rerun (fix the flaky test; nitpicker counts a rerun as a failure): java.lang.IllegalStateException',
    ],
  ])('counts a test that failed and passed only on %s as failed', (_name, body, expected) => {
    expect(failuresOf(body)).toEqual([expected]);
  });

  it('lets a rerun pass when the project opted in to its own retries, and still fails a hard failure', () => {
    const root = directory();
    const file = path.join(root, 'TEST-shop.CartTest.xml');
    writeFileSync(
      file,
      `<testsuite name="shop.CartTest">
        <testcase classname="shop.CartTest" name="adds"><flakyFailure message="x"/></testcase>
        <testcase classname="shop.CartTest" name="empties"><failure message="no"/></testcase>
      </testsuite>`,
    );

    expect(failedCaseEntries(file).map(({ detail }) => detail.name)).toEqual([
      'shop.CartTest.adds',
      'shop.CartTest.empties',
    ]);
    expect(failedCaseEntries(file, { retriesPass: true }).map(({ detail }) => detail.name)).toEqual(
      ['shop.CartTest.empties'],
    );
  });

  it('lists a test whose every rerun failed once, as a plain failure', () => {
    expect(
      failuresOf(`<testcase classname="shop.CartTest" name="adds">
        <failure message="expected: 4"/>
        <rerunFailure message="expected: 4"/>
        <rerunFailure message="expected: 4"/>
      </testcase>`),
    ).toEqual(['shop.CartTest.adds: expected: 4']);
  });

  it('lists both attempts of a test written by the Gradle retry plugin as one failure', () => {
    expect(
      failuresOf(`<testcase classname="shop.CartTest" name="adds()"><failure message="expected: 4"/></testcase>
      <testcase classname="shop.CartTest" name="adds()"/>`),
    ).toEqual(['shop.CartTest.adds: expected: 4']);
  });

  it('passes a clean test', () => {
    expect(failuresOf('<testcase classname="shop.CartTest" name="adds"/>')).toEqual([]);
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
  it('lists at most fifty failing tests and counts the rest', () => {
    const tests = Array.from({ length: 52 }, (_, index) => `shop.T.t${String(index)}: no`);

    expect(failingTestsError([{ module: '.', tests }]).message.split('\n')).toEqual([
      '52 tests fail; the build stopped, so no other check ran. Fix the tests and rerun:',
      ...tests.slice(0, 50).map((test) => `  ${test}`),
      '  and 2 more',
    ]);
  });

  it('cuts a long failure line so the message keeps the log path that follows it', () => {
    const long = `shop.T.t: ${'x'.repeat(400)}`;

    expect(failingTestsError([{ module: '.', tests: [long] }]).message.split('\n')[1]).toBe(
      `  ${long.slice(0, 298)}…`,
    );
  });

  it('keeps the count of the unlisted tests within the length the runner keeps', () => {
    const value = 'v'.repeat(400);
    const tests = Array.from({ length: 60 }, (_, index) => `shop.T.t${String(index)}`);
    const details = tests.map((name) => ({
      name: `${name}${'n'.repeat(400)}`,
      message: 'm'.repeat(400),
      file: 'shop/T.java',
      line: 12,
      expected: value,
      received: value,
    }));
    const lines = failingTestsError([{ module: '.', tests, details }]).message.split('\n');

    expect(lines.at(-1)).toBe('  and 10 more');
    expect(lines.join('\n').length).toBeLessThan(40_000);
  });

  it('lists the tests of every module', () => {
    const error = failingTestsError([
      { module: '.', tests: ['shop.T.a: no'] },
      { module: 'core', tests: ['shop.U.b: no'] },
    ]);

    expect(error.message.split('\n')).toEqual([
      '2 tests fail in core; the build stopped, so no other check ran. Fix the tests and rerun:',
      '  shop.T.a: no',
      '  shop.U.b: no',
    ]);
  });

  it('keeps the failures on the error without changing how it compares', () => {
    const failures = [{ module: 'core', tests: ['shop.T.t: no'] }];
    const error = failingTestsError(failures);

    expect(error.failures).toBe(failures);
    expect(Object.keys(error)).toEqual([]);
  });
});

describe('moduleName', () => {
  it('is the dot for the root project and the directory for a module', () => {
    expect([moduleName(''), moduleName('core')]).toEqual(['.', 'core']);
  });
});
