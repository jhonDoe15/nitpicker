import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { renderJunitReport } from '../diff/reporting/junit.mjs';
import { renderSarifReport } from '../diff/reporting/sarif.mjs';
import { renderTextReport } from '../diff/reporting/text.mjs';
import { report } from '../diff/reporting/test-support/report-builders.mjs';
import { writeSnapshotReports } from '../snapshot/reporters.mjs';
import { quickSummary, runProfileSummary } from './summary.mjs';

const QUICK = quickSummary(['coverage', 'mutation']);
const QUICK_LINE =
  'Quick run: skipped coverage, mutation. Run nitpicker without --quick before you finish.';
const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function profiledReport(profile) {
  const base = report();
  return { ...base, summary: { ...base.summary, ...runProfileSummary(profile) } };
}

function snapshotReport(profile, file) {
  const outputRoot = mkdtempSync(path.join(tmpdir(), 'nitpicker-quick-snapshot-'));
  roots.push(outputRoot);
  const summary = {
    overallStatus: 'completed',
    enforceableFindings: 0,
    elapsedMs: 0,
    tools: [],
    ...runProfileSummary(profile),
  };
  writeSnapshotReports(outputRoot, { summary, findings: [], toolErrors: [] });
  return readFileSync(path.join(outputRoot, file), 'utf8');
}

describe('the run profile in summary.json', () => {
  it('says whether the run was quick or full and whether it judged the index', () => {
    expect(runProfileSummary({ quick: undefined, staged: false })).toEqual({ mode: 'full' });
    expect(runProfileSummary({ quick: QUICK, staged: true })).toEqual({
      mode: 'quick',
      quick: QUICK,
      staged: true,
    });
  });
});

describe('the run profile in the JUnit report', () => {
  it('marks a quick run and reports each skipped check as a skipped test case', () => {
    expect(renderJunitReport(profiledReport({ quick: QUICK, staged: true }))).toBe(
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<testsuite name="quality.diff" tests="3" failures="0" errors="0" skipped="2" time="1.500">',
        '  <properties>',
        '    <property name="quick" value="true"/>',
        '    <property name="staged" value="true"/>',
        '  </properties>',
        '  <testcase classname="quality.diff" name="eslint" time="0.040"></testcase>',
        `  <testcase classname="quality.diff.skipped" name="coverage" time="0"><skipped message="${QUICK_LINE}"/></testcase>`,
        `  <testcase classname="quality.diff.skipped" name="mutation" time="0"><skipped message="${QUICK_LINE}"/></testcase>`,
        '</testsuite>',
        '',
      ].join('\n'),
    );
  });

  it('adds nothing to a full run', () => {
    expect(renderJunitReport(profiledReport({}))).toBe(
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<testsuite name="quality.diff" tests="1" failures="0" errors="0" time="1.500">',
        '  <testcase classname="quality.diff" name="eslint" time="0.040"></testcase>',
        '</testsuite>',
        '',
      ].join('\n'),
    );
  });

  it('marks a quick --all snapshot the same way', () => {
    expect(snapshotReport({ quick: QUICK }, 'report.junit.xml')).toBe(
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<testsuite name="quality.snapshot" tests="2" failures="0" errors="0" skipped="2" time="0.000">',
        '  <properties>',
        '    <property name="quick" value="true"/>',
        '  </properties>',
        `  <testcase classname="quality.snapshot.skipped" name="coverage" time="0"><skipped message="${QUICK_LINE}"/></testcase>`,
        `  <testcase classname="quality.snapshot.skipped" name="mutation" time="0"><skipped message="${QUICK_LINE}"/></testcase>`,
        '</testsuite>',
        '',
      ].join('\n'),
    );
  });
});

describe('the run profile in the SARIF report', () => {
  it('warns that the run was quick and records the profile on the invocation', () => {
    const [invocation] = JSON.parse(
      renderSarifReport(profiledReport({ quick: QUICK, staged: true })),
    ).runs[0].invocations;

    expect(invocation).toEqual({
      executionSuccessful: true,
      toolExecutionNotifications: [{ level: 'warning', message: { text: QUICK_LINE } }],
      properties: { quick: true, skipped: ['coverage', 'mutation'], staged: true },
    });
  });

  it('marks a quick --all snapshot the same way', () => {
    const [invocation] = JSON.parse(snapshotReport({ quick: QUICK }, 'report.sarif')).runs[0]
      .invocations;

    expect(invocation).toEqual({
      executionSuccessful: true,
      toolExecutionNotifications: [{ level: 'warning', message: { text: QUICK_LINE } }],
      properties: { quick: true, skipped: ['coverage', 'mutation'] },
    });
  });

  it('adds nothing to a full run', () => {
    const [invocation] = JSON.parse(renderSarifReport(profiledReport({}))).runs[0].invocations;

    expect(invocation).toEqual({ executionSuccessful: true, toolExecutionNotifications: [] });
  });
});

describe('the run profile in report.txt', () => {
  it('names the staged head under the head commit and ends the summary with the quick line', () => {
    expect(
      renderTextReport(profiledReport({ quick: QUICK, staged: true }))
        .split('\n')
        .slice(0, 13),
    ).toEqual([
      'Nitpicker quality diff',
      'Base ref: main',
      'Merge base: abc',
      'Head: def',
      'Staged run: the head is the index. Unstaged edits and untracked files are not judged.',
      'Status: completed',
      'New enforceable findings: 0',
      'New findings: 0',
      'Resolved findings: 0',
      'Unchanged findings: 0',
      'Changed metrics: 0',
      'Tool errors: 0',
      QUICK_LINE,
    ]);
  });
});
