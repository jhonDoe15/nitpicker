import { exactText } from './test-support/output-expectations.mjs';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { absoluteTextReportPath, writeDiffReports } from './reporters.mjs';
import { renderTextReport } from './text.mjs';
import { expectValidSarif, expectWellFormedXml } from './test-support/report-assertions.mjs';
import { finding, report } from './test-support/report-builders.mjs';
import { docsUrl } from '../../../shared/messages/docs-url.mjs';
import { referenceLinks } from '../../../shared/reference/store.mjs';

const temporaryRoots = [];
const KNOWN_FINDING = finding({ tool: 'eslint-lint', rule: 'no-debugger' });

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('writeDiffReports', () => {
  it('writes JSON, text, JUnit and SARIF files to the reports directory', () => {
    const outputRoot = mkdtempSync(path.join(tmpdir(), 'nitpicker-reports-'));
    temporaryRoots.push(outputRoot);

    writeDiffReports(outputRoot, report({ newFindings: [KNOWN_FINDING] }));

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
eslint-lint/no-debugger src/a.js:12 Unexpected console statement

Rule reference: ${docsUrl('docs/rules/README.md')} (nitpicker explain <tool/rule> prints one rule)
`),
    );
  });
});

describe('new-findings.json', () => {
  function written(findings) {
    const outputRoot = mkdtempSync(path.join(tmpdir(), 'nitpicker-reports-'));
    temporaryRoots.push(outputRoot);
    writeDiffReports(outputRoot, report({ newFindings: findings }));
    return JSON.parse(readFileSync(path.join(outputRoot, 'new-findings.json'), 'utf8'));
  }

  it('links each finding whose rule has an entry in the rule reference', () => {
    const [known, unknown] = written([
      finding({ tool: 'pmd', rule: 'UnusedLocalVariable', identity: 'a' }),
      finding({ tool: 'custom', rule: 'text-file', identity: 'b' }),
    ]);

    expect(known.helpUri).toBe(docsUrl('docs/rules/java-pmd.md', 'pmd-unusedlocalvariable'));
    expect(unknown).not.toHaveProperty('helpUri');
  });

  it('keeps the helpUri an analyzer gave', () => {
    const [given] = written([
      finding({
        tool: 'pmd',
        rule: 'UnusedLocalVariable',
        identity: 'a',
        helpUri: 'https://example.com/own',
      }),
    ]);

    expect(given.helpUri).toBe('https://example.com/own');
  });
});

describe('held-findings.json and resolved-findings.json', () => {
  it('link each finding whose rule has an entry in the rule reference', () => {
    const outputRoot = mkdtempSync(path.join(tmpdir(), 'nitpicker-reports-'));
    temporaryRoots.push(outputRoot);
    const known = finding({ tool: 'pmd', rule: 'UnusedLocalVariable', identity: 'a' });

    writeDiffReports(outputRoot, { ...report(), resolvedFindings: [known] });

    expect(
      JSON.parse(readFileSync(path.join(outputRoot, 'resolved-findings.json'), 'utf8')).map(
        ({ helpUri }) => helpUri,
      ),
    ).toEqual([docsUrl('docs/rules/java-pmd.md', 'pmd-unusedlocalvariable')]);
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

  it('ends the new findings with a link to the rule reference, only when one of them has an entry', () => {
    const line = /^Rule reference: https:\/\/\S+\/docs\/rules\/README\.md \(.*\)$/mu;

    expect(renderTextReport(report({ newFindings: [KNOWN_FINDING] }))).toMatch(line);
    expect(renderTextReport(report())).not.toMatch(/Rule reference/u);
    expect(
      renderTextReport(report({ newFindings: [finding({ tool: 'custom', rule: 'text-file' })] })),
    ).not.toMatch(/Rule reference/u);
  });

  it('prints no rule reference line when the package gives no link root', () => {
    const known = referenceLinks();
    const reference = { index: () => known.index(), root: () => undefined };

    expect(renderTextReport(report({ newFindings: [KNOWN_FINDING] }), { reference })).not.toMatch(
      /Rule reference/u,
    );
  });
});
