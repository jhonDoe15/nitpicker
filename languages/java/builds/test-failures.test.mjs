import { mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { failedCases, failingTestsError, freshReports } from './test-failures.mjs';
import { linkSentence } from '../../../shared/messages/test-support/link-sentence.mjs';

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
    const failures = Array.from({ length: 12 }, (_, index) => `shop.T.t${String(index)}: no`);

    expect(failingTestsError('/repo', failures).message.split('\n')).toEqual([
      'Tests fail in /repo; nitpicker needs a passing test suite for coverage and mutation testing:',
      ...failures.slice(0, 10).map((failure) => `  ${failure}`),
      '  and 2 more',
      linkSentence('testsFail'),
    ]);
  });
});
