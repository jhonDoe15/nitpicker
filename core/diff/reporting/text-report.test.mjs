import { exactText } from './test-support/output-expectations.mjs';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { absoluteTextReportPath, writeDiffReports } from './reporters.mjs';
import { renderTextReport } from './text.mjs';
import { expectValidSarif, expectWellFormedXml } from './test-support/report-assertions.mjs';
import { finding, report } from './test-support/report-builders.mjs';

const temporaryRoots = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('writeDiffReports', () => {
  it('writes JSON, text, JUnit and SARIF files to the reports directory', () => {
    const outputRoot = mkdtempSync(path.join(tmpdir(), 'nitpicker-reports-'));
    temporaryRoots.push(outputRoot);

    writeDiffReports(outputRoot, report({ newFindings: [finding()] }));

    expectValidSarif(JSON.parse(readFileSync(path.join(outputRoot, 'report.sarif'), 'utf8')));
    expectWellFormedXml(readFileSync(path.join(outputRoot, 'report.junit.xml'), 'utf8'));
    expect(
      JSON.parse(readFileSync(path.join(outputRoot, 'new-findings.json'), 'utf8')),
    ).toHaveLength(1);
    expect(readFileSync(path.join(outputRoot, 'report.txt'), 'utf8')).toEqual(
      expect.stringMatching(exactText`Nitpicker quality diff
Base ref: main
Merge base: abc
Head: def
Status: completed
New enforceable findings: 1
New findings: 1
Resolved findings: 0
Unchanged findings: 0
Changed metrics: 0
Tool errors: 0

Per-tool counts:
eslint: base=0 head=1 new=1 resolved=0 unchanged=0 changed-metrics=undefined elapsed=${/[0-9]+(?:\.[0-9]+)?/}s

New findings:
eslint/no-console src/a.js:12 Unexpected console statement
`),
    );
  });
});

describe('absoluteTextReportPath', () => {
  it('returns the report file inside an absolute output root', () => {
    expect(absoluteTextReportPath(path.join(path.sep, 'work', 'out'))).toBe(
      path.join(path.sep, 'work', 'out', 'report.txt'),
    );
  });
  it('resolves a relative output root so the printed path works from any directory', () => {
    const resolved = absoluteTextReportPath(path.join('..', 'control', 'reports'));

    expect(path.isAbsolute(resolved)).toBe(true);
    expect(resolved).toBe(path.resolve('..', 'control', 'reports', 'report.txt'));
  });
});

describe('renderTextReport', () => {
  it('marks an analyzer that was skipped instead of showing it as clean', () => {
    const tool = (name, extra = {}) => ({
      name,
      base: 0,
      head: 0,
      new: 0,
      resolved: 0,
      unchanged: 0,
      changedMetrics: 0,
      elapsedMs: 0,
      ...extra,
    });
    const text = renderTextReport({
      summary: {
        requestedBaseRef: 'main',
        mergeBaseSha: 'a',
        headSha: 'b',
        overallStatus: 'tool-error',
        newEnforceableFindings: 0,
        tools: [tool('coverage'), tool('crap', { skippedBecause: 'coverage' })],
      },
      newFindings: [],
      resolvedFindings: [],
      changedMetrics: [],
      unchangedFindings: [],
      toolErrors: [],
    });

    expect(text).toMatch(/^crap: .* skipped \(coverage failed\)$/mu);
    expect(text).not.toMatch(/^coverage: .*skipped/mu);
  });
});
