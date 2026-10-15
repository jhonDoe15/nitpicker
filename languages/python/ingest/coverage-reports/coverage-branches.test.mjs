import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { compareFindings } from '../../../../core/diff/comparison/compare.mjs';
import { parseAnalyzerReport } from '../../../../core/diff/comparison/finding-schema.mjs';
import { parseChangedLines } from '../../../../core/diff/git/patches/changed-lines.mjs';
import { isStrictRule } from '../../../typescript/preset/strict-rules.mjs';
import { ingestCoverageBranches } from './coverage-branches.mjs';

const fixture = (name) => readFileSync(path.join(import.meta.dirname, '..', 'fixtures', name), 'utf8');
const report = fixture('coverage-branches.json');
const SOURCE = fixture('branches.py');
const FILE = 'src/demo/branches.py';

const ingest = (options = {}, text = report) =>
  ingestCoverageBranches(text, {
    sourceText: (file) => (file === FILE ? SOURCE : undefined),
    ...options,
  }).findings;

const reportOf = (executed, missing, file = FILE) =>
  JSON.stringify({
    files: { [file]: { executed_branches: executed, missing_branches: missing } },
  });

describe('ingestCoverageBranches', () => {
  it('reports every line with branch coverage below 95%, and only those', () => {
    const findings = ingest();

    expect(findings.map((f) => [f.location.line, f.message])).toEqual([
      [
        2,
        "Branch coverage is 50.00%; minimum is 95%. Not taken: the branch to line 3. Test it, or remove it if it can't happen. To exempt a file, add it to exclude in nitpicker.config.json.",
      ],
      [
        5,
        "Branch coverage is 50.00%; minimum is 95%. Not taken: the branch to line 6. Test it, or remove it if it can't happen. To exempt a file, add it to exclude in nitpicker.config.json.",
      ],
      [
        7,
        "Branch coverage is 50.00%; minimum is 95%. Not taken: the branch to line 8. Test it, or remove it if it can't happen. To exempt a file, add it to exclude in nitpicker.config.json.",
      ],
      [
        13,
        "Branch coverage is 0.00%; minimum is 95%. Not taken: the branch to line 14; the branch to line 15. Test it, or remove it if it can't happen. To exempt a file, add it to exclude in nitpicker.config.json.",
      ],
    ]);
    expect(
      findings.every(
        (f) =>
          f.tool === 'coverage-py' &&
          f.rule === 'changed-branch-coverage' &&
          f.path === FILE &&
          f.classification === 'enforceable',
      ),
    ).toBe(true);
    expect(() => parseAnalyzerReport({ findings }, 'python')).not.toThrow();
  });

  it('honors the minimum and tool options', () => {
    expect(ingest({ minimum: 40 }).map((f) => f.location.line)).toEqual([13]);
    expect(ingest({ tool: 'cov' })[0].tool).toBe('cov');
  });

  it('describes a jump out of the enclosing scope', () => {
    const [finding] = ingest({}, reportOf([[2, 3]], [[2, -1]]));

    expect(finding.message).toBe(
      "Branch coverage is 50.00%; minimum is 95%. Not taken: the exit from the enclosing scope. Test it, or remove it if it can't happen. To exempt a file, add it to exclude in nitpicker.config.json.",
    );
  });

  it('skips files without source, without branches and with unusable data', () => {
    expect(ingest({ sourceText: () => undefined })).toEqual([]);
    expect(ingest({ sourceText: undefined })).toEqual([]);
    expect(ingest({}, reportOf([], []))).toEqual([]);
    expect(ingest({}, JSON.stringify({ files: { [FILE]: {} } }))).toEqual([]);
    expect(
      ingest({}, reportOf([[2, 3], 'x', [4], [null, 5]], [['a', 1], 7, [2, 4], [2, 6]])).map(
        (f) => f.location.line,
      ),
    ).toEqual([2]);
    expect(ingest({ sourceText: () => '\n\n' })).toEqual([]);
  });

  it('makes paths project-relative and ignores files outside the project', () => {
    const text = JSON.stringify({
      files: {
        [`/work/proj/${FILE}`]: {
          executed_branches: [],
          missing_branches: [
            [2, 3],
            [2, 4],
          ],
        },
        '/elsewhere/x.py': {
          executed_branches: [],
          missing_branches: [
            [2, 3],
            [2, 4],
          ],
        },
        '../y.py': {
          executed_branches: [],
          missing_branches: [
            [2, 3],
            [2, 4],
          ],
        },
      },
    });

    const findings = ingestCoverageBranches(text, {
      roots: ['/other', '/work/proj'],
      sourceText: () => SOURCE,
    }).findings;

    expect(findings.map((f) => f.path)).toEqual([FILE]);
  });

  it.each(['{}', '[]', 'null', '{"files": 3}', '{"files": null}'])('rejects %s', (text) => {
    expect(() => ingestCoverageBranches(text)).toThrow(
      'coverage.py JSON report must contain a files object',
    );
  });

  it('identifies a branch by its source text, not its line', () => {
    const before = ingest();
    const shifted = JSON.stringify({
      files: {
        [FILE]: {
          executed_branches: [
            [4, 6],
            [6, 7],
            [6, 9],
            [7, 6],
            [9, 11],
          ],
          missing_branches: [
            [4, 5],
            [7, 8],
            [9, 10],
            [15, 16],
            [15, 17],
          ],
        },
      },
    });
    const after = ingestCoverageBranches(shifted, {
      sourceText: () => `# header\n# more\n${SOURCE}`,
    }).findings;

    expect(after.map((f) => f.identity)).toEqual(before.map((f) => f.identity));
    expect(after[0].location.line).toBe(before[0].location.line + 2);
    for (const finding of before) {
      expect(finding.identity).toMatch(/^branch-source:[0-9a-f]{16}(#\d+)?$/);
    }
  });

  it('numbers identical lines per enclosing scope, nested scopes included', () => {
    const source = [
      'class A:',
      '    def m(self, x):',
      '        if x:',
      '            pass',
      '    def n(self, x):',
      '        if x:',
      '            pass',
      'def m(x):',
      '    if x:',
      '        pass',
      'if x:',
      '    pass',
    ].join('\n');
    const gaps = [3, 6, 9, 11].flatMap((line) => [
      [line, line + 1],
      [line, line + 2],
    ]);

    const findings = ingestCoverageBranches(reportOf([], gaps), {
      sourceText: () => source,
    }).findings;

    expect(new Set(findings.map((f) => f.identity)).size).toBe(4);
    expect(findings.every((f) => !f.identity.includes('#'))).toBe(true);
  });

  it('tells identical lines apart by order and ignores indentation and spacing', () => {
    const source = ['if x:', '    pass', 'if  x:', '', '  if x:'].join('\n');
    const text = reportOf(
      [],
      [
        [1, 2],
        [1, 3],
        [3, 4],
        [3, 5],
        [5, 6],
        [5, 7],
      ],
    );

    const findings = ingestCoverageBranches(text, { sourceText: () => source }).findings;

    expect(findings.map((f) => f.identity.replace(/^[^#]+/, ''))).toEqual(['', '#2', '#3']);
    expect(new Set(findings.map((f) => f.identity.split('#')[0])).size).toBe(1);
  });
});

describe('changed-branch-coverage in the differential comparison', () => {
  const touched = (diff) => ({ changedLines: parseChangedLines(diff), isStrictRule });
  const diffFor = (hunk) =>
    [`diff --git a/${FILE} b/${FILE}`, `--- a/${FILE}`, `+++ b/${FILE}`, hunk].join('\n');

  const base = ingest();

  it('baselines an uncovered branch that was already there', () => {
    const result = compareFindings({
      baseFindings: base,
      headFindings: base,
      touchedCode: touched(diffFor('@@ -1 +1 @@')),
    });

    expect(result.newFindings).toEqual([]);
    expect(result.unchangedFindings).toHaveLength(4);
  });

  it('fails the existing uncovered branch once its line is changed', () => {
    const result = compareFindings({
      baseFindings: base,
      headFindings: base,
      touchedCode: touched(diffFor('@@ -13 +13 @@')),
    });

    expect(result.newFindings.map((f) => f.location.line)).toEqual([13]);
    expect(result.unchangedFindings.map((f) => f.location.line).sort((a, b) => a - b)).toEqual([
      2, 5, 7,
    ]);
  });

  it('fails a newly added uncovered branch', () => {
    const added = compareFindings({
      baseFindings: base.slice(0, 3),
      headFindings: base,
      touchedCode: touched(diffFor('@@ -12,0 +13,3 @@')),
    });

    expect(added.newFindings.map((f) => f.location.line)).toEqual([13]);
  });

  it('keeps a legacy gap baselined when an identical line is added above it in another function', () => {
    const legacy = 'def legacy(a):\n    if a:\n        return 1\n    return 2\n';
    const fresh = 'def fresh(a):\n    if a:\n        return 1\n    return 2\n';
    const gaps = (...lines) =>
      reportOf(
        [],
        lines.flatMap((line) => [
          [line, line + 1],
          [line, line + 2],
        ]),
      );

    const result = compareFindings({
      baseFindings: ingest({ sourceText: () => legacy }, gaps(2)),
      headFindings: ingest({ sourceText: () => `${fresh}\n\n${legacy}` }, gaps(2, 8)),
      touchedCode: touched(diffFor('@@ -0,0 +1,6 @@')),
    });

    expect(result.newFindings.map((f) => f.location.line)).toEqual([2]);
    expect(result.unchangedFindings.map((f) => f.location.line)).toEqual([8]);
  });

  it('applies to the Python tool only, not to the TypeScript coverage check of the same rule', () => {
    expect(isStrictRule('changed-branch-coverage', { tool: 'coverage-py' })).toBe(true);
    expect(isStrictRule('changed-branch-coverage', { tool: 'coverage' })).toBe(false);
  });
});
