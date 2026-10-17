import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readJavaFindings } from '../java-reports.mjs';
import { readTestFailures, TEST_FAILURES_REPORT, testFailureFindings } from './test-results.mjs';
import { reportBaseOf, writeModules } from '../../test-support/report-base.mjs';

const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

const BAD = 'lib/src/main/java/demo/Bad.java';
const sarif = (results) =>
  JSON.stringify({ runs: [{ tool: { driver: { name: 'x', rules: [] } }, results }] });
const REPORTS = {
  'manifest.json': JSON.stringify({ versions: {}, sourceRoots: ['lib/src/main/java'] }),
  'pmd.sarif': sarif([
    {
      ruleId: 'EmptyCatchBlock',
      message: { text: 'Avoid empty catch blocks' },
      locations: [
        { physicalLocation: { artifactLocation: { uri: BAD }, region: { startLine: 1 } } },
      ],
    },
  ]),
  'spotbugs.sarif': sarif([]),
  'format.txt': '',
  'checkstyle.xml': '<checkstyle version="13.5.0"></checkstyle>',
  'structure.json': '[]',
  'classes.json': JSON.stringify({ files: {}, classes: [] }),
};

function projectWithFailingTests(report) {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-test-results-')));
  roots.push(root);
  writeModules(root);
  const moduleReports = path.join(reportBaseOf(root), 'module-lib');
  mkdirSync(moduleReports, { recursive: true });
  writeFileSync(
    path.join(reportBaseOf(root), 'modules.json'),
    JSON.stringify([{ key: 'module-lib', path: ':lib', dir: 'lib' }]),
  );
  for (const [name, text] of Object.entries({
    ...REPORTS,
    [TEST_FAILURES_REPORT]: JSON.stringify(report),
  })) {
    writeFileSync(path.join(moduleReports, name), text);
  }
  writeFileSync(path.join(reportBaseOf(root), 'duplicates.json'), JSON.stringify({ runs: [] }));
  mkdirSync(path.dirname(path.join(root, BAD)), { recursive: true });
  writeFileSync(path.join(root, BAD), 'package demo;\n');
  return root;
}

const FAILING = 'demo.BadTest.reads: expected 1';

describe('test results of a module whose tests fail', () => {
  it('keeps every other finding and reports the failing tests and each skipped analyzer', () => {
    const root = projectWithFailingTests({
      failures: [FAILING],
      excludedTestClasses: ['demo.BadTest'],
      skipped: [{ tool: 'pit', reason: 'every test class has a failing test' }],
    });

    const { findings } = readJavaFindings(root, {
      reportBase: reportBaseOf(root),
      baseline: { snapshot: 'base' },
    });

    expect(
      findings.map(({ tool, rule, identity, classification }) => ({
        tool,
        rule,
        identity,
        classification,
      })),
    ).toEqual([
      {
        tool: 'pmd',
        rule: 'EmptyCatchBlock',
        identity: expect.any(String),
        classification: 'enforceable',
      },
      ...[
        ['tests', 'tests-failed'],
        ['pit', 'tests-failed-skipped'],
      ].map(([tool, rule]) => ({
        tool,
        rule,
        identity: `${rule}@:lib`,
        classification: 'tool-error',
      })),
    ]);
    expect(findings.slice(1).map(({ message }) => message)).toEqual([
      [
        'Tests fail in module lib of the base snapshot. Make each failing test pass:',
        `  ${FAILING}`,
        'The static analyzers ran as usual; coverage and CRAP come from the tests that ran.',
        'Mutation testing (PIT) did not run: every test class has a failing test.',
      ].join('\n'),
      'Mutation testing (PIT) did not run in module lib of the base snapshot: every test class ' +
        'has a failing test.',
    ]);
  });

  it('names every failing test and the test classes mutation testing left out', () => {
    const failures = Array.from({ length: 12 }, (_, index) => `demo.T.case${String(index)}: no`);

    const [failure] = testFailureFindings(
      { failures, excludedTestClasses: ['demo.T'], skipped: [] },
      {},
    );

    expect(failure.message.split('\n')).toEqual([
      'Tests fail in the head snapshot. Make each failing test pass:',
      ...failures.map((line) => `  ${line}`),
      'The static analyzers ran as usual; coverage and CRAP come from the tests that ran.',
      'Mutation testing (PIT) left out the test classes demo.T.',
    ]);
  });

  it('reads no failures from a module without a test failure report', () => {
    const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-test-results-')));
    roots.push(root);

    expect(readTestFailures(root)).toEqual({ failures: [], excludedTestClasses: [], skipped: [] });
  });
});
