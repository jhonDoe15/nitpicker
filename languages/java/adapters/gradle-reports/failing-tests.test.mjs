import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { failingTestsOf } from './failing-tests.mjs';

const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function gradleRun({ suites }) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-failing-tests-'));
  roots.push(root);
  const reportBase = path.join(root, 'reports');
  const results = path.join(root, 'app/build/test-results/test');
  mkdirSync(reportBase, { recursive: true });
  mkdirSync(results, { recursive: true });
  writeFileSync(path.join(reportBase, 'test-results.json'), JSON.stringify([results]));
  for (const [name, text] of Object.entries(suites)) {
    writeFileSync(path.join(results, `TEST-${name}.xml`), text);
  }
  return { root, reportBase };
}

describe('failingTestsOf', () => {
  it('names the failing tests of a Gradle run like the Maven build does', () => {
    const { root, reportBase } = gradleRun({
      suites: {
        'shop.CartTest': `<testsuite name="shop.CartTest"><testcase classname="shop.CartTest" name="adds"><failure message="expected: &lt;4&gt; but was: &lt;3&gt;"/></testcase></testsuite>`,
      },
    });

    expect(failingTestsOf(root, { reportBase, since: 0 }).message).toBe(
      [
        `Tests fail in ${root}; nitpicker needs a passing test suite for coverage and mutation testing:`,
        '  shop.CartTest.adds: expected: <4> but was: <3>',
      ].join('\n'),
    );
  });

  it('leaves the build failure as it is when no test failed or the run wrote no list', () => {
    const { root, reportBase } = gradleRun({
      suites: {
        'shop.CartTest': '<testsuite name="shop.CartTest"><testcase name="adds"/></testsuite>',
      },
    });

    expect(failingTestsOf(root, { reportBase, since: 0 })).toBeUndefined();
    expect(failingTestsOf(root, { reportBase: path.join(root, 'none'), since: 0 })).toBeUndefined();
  });
});
