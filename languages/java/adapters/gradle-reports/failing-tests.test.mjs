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

const FAILING = [
  '<testsuite name="shop.CartTest"><testcase classname="shop.CartTest" name="adds">',
  '<failure message="expected: &lt;4&gt; but was: &lt;3&gt;"/></testcase></testsuite>',
].join('');
const PASSING = '<testsuite name="shop.CartTest"><testcase name="adds"/></testsuite>';

function gradleRun(modules) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-failing-tests-'));
  roots.push(root);
  const reportBase = path.join(root, 'reports');
  mkdirSync(reportBase, { recursive: true });
  const listed = Object.entries(modules).map(([dir, suite]) => {
    const results = path.join(root, dir, 'build/test-results/test');
    mkdirSync(results, { recursive: true });
    writeFileSync(path.join(results, 'TEST-shop.CartTest.xml'), suite);
    return { dir, results: [results] };
  });
  writeFileSync(path.join(reportBase, 'test-results.json'), JSON.stringify(listed));
  return { root, reportBase };
}

describe('failingTestsOf', () => {
  it('names the failing tests of each module like the Maven build does', () => {
    const { reportBase } = gradleRun({ '': FAILING, core: FAILING, api: PASSING });

    expect(failingTestsOf({ reportBase, since: 0 })).toEqual([
      { module: '.', tests: ['shop.CartTest.adds: expected: <4> but was: <3>'] },
      { module: 'core', tests: ['shop.CartTest.adds: expected: <4> but was: <3>'] },
    ]);
  });

  it('is empty when no test failed or the run wrote no list', () => {
    const { root, reportBase } = gradleRun({ core: PASSING });

    expect([
      failingTestsOf({ reportBase, since: 0 }),
      failingTestsOf({ reportBase: path.join(root, 'none'), since: 0 }),
    ]).toEqual([[], []]);
  });
});
