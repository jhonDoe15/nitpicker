import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { compareFindings } from '../../../../core/diff/comparison/compare.mjs';
import { parseAnalyzerReport } from '../../../../core/diff/comparison/finding-schema.mjs';
import { parseChangedLines } from '../../../../core/diff/git/patches/changed-lines.mjs';
import { isStrictRule } from '../../../typescript/preset/strict-rules.mjs';
import { ingestCoverageBranches } from './coverage-branches.mjs';

const fixture = (name) =>
  readFileSync(path.join(import.meta.dirname, '..', 'fixtures', name), 'utf8');
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

    expect(findings.map((finding) => [finding.location.line, finding.message])).toEqual([
      [
        2,
        'Branch coverage is 50.00%; minimum is 95%. Not taken: the branch to line 3. Test it, or remove it if it can\'t happen. To accept the file, add it to "exclude" in nitpicker.config.json.',
      ],
      [
        5,
        'Branch coverage is 50.00%; minimum is 95%. Not taken: the branch to line 6. Test it, or remove it if it can\'t happen. To accept the file, add it to "exclude" in nitpicker.config.json.',
      ],
      [
        7,
        'Branch coverage is 50.00%; minimum is 95%. Not taken: the branch to line 8. Test it, or remove it if it can\'t happen. To accept the file, add it to "exclude" in nitpicker.config.json.',
      ],
      [
        13,
        'Branch coverage is 0.00%; minimum is 95%. Not taken: the branch to line 14; the branch to line 15. Test it, or remove it if it can\'t happen. To accept the file, add it to "exclude" in nitpicker.config.json.',
      ],
    ]);
    expect(
      findings.every(
        (finding) =>
          finding.tool === 'coverage-py' &&
          finding.rule === 'changed-branch-coverage' &&
          finding.path === FILE &&
          finding.classification === 'enforceable',
      ),
    ).toBe(true);
    expect(() => parseAnalyzerReport({ findings }, 'python')).not.toThrow();
  });

  it('names the function that holds a branch and the exceptions entry that accepts it', () => {
    const functions = [
      { file: FILE, name: 'pick', start: 1, end: 9 },
      { file: FILE, name: 'lonely', start: 12, end: 15 },
    ];

    const findings = ingest({ functions });

    expect(findings.map(({ location, symbol }) => [location.line, symbol])).toEqual([
      [2, 'pick'],
      [5, 'pick'],
      [7, 'pick'],
      [13, 'lonely'],
    ]);
    expect(findings[3].message).toBe(
      'Branch coverage is 0.00%; minimum is 95%. Not taken: the branch to line 14; the branch to line 15. Test it, or remove it if it can\'t happen. If this is intended, add {"rule":"changed-branch-coverage","paths":["src/demo/branches.py"],"function":"lonely","reason":"..."} to "exceptions" in nitpicker.config.json.',
    );
  });

  it('honors the minimum and tool options', () => {
    expect(ingest({ minimum: 40 }).map((finding) => finding.location.line)).toEqual([13]);
    expect(ingest({ tool: 'cov' })[0].tool).toBe('cov');
  });

  it('describes a jump out of the enclosing scope', () => {
    const [finding] = ingest({}, reportOf([[2, 3]], [[2, -1]]));

    expect(finding.message).toBe(
      'Branch coverage is 50.00%; minimum is 95%. Not taken: the exit from the enclosing scope. Test it, or remove it if it can\'t happen. To accept the file, add it to "exclude" in nitpicker.config.json.',
    );
  });

  it.each([
    ['the exit', -1],
    ['the line after the match', 7],
  ])('names the assert_never form when no case matching leads to %s', (_, destination) => {
    const source =
      'def name(color):\n    match color:\n        case Color.RED:\n            return 1\n        case Color.BLUE:\n            return 2\n    return 0\n';
    const findings = ingest(
      { sourceText: () => source },
      reportOf(
        [
          [5, 6],
          [3, 4],
          [3, 5],
        ],
        [[5, destination]],
      ),
    );

    expect(findings.map((finding) => finding.message)).toEqual([
      'Branch coverage is 50.00%; minimum is 95%. Not taken: no case matching (if the cases cover every value, end the match with `case _:` and `assert_never(subject)`). Test it, or remove it if it can\'t happen. To accept the file, add it to "exclude" in nitpicker.config.json.',
    ]);
  });

  it('names an untested default case by its line', () => {
    const source = 'match color:\n    case Color.RED:\n        x = 1\n    case _:\n        x = 2\n';
    const [finding] = ingest({ sourceText: () => source }, reportOf([[2, 3]], [[2, 4]]));

    expect(finding.message).toBe(
      'Branch coverage is 50.00%; minimum is 95%. Not taken: the branch to line 4. Test it, or remove it if it can\'t happen. To accept the file, add it to "exclude" in nitpicker.config.json.',
    );
  });

  it('skips files without source, without branches and with unusable data', () => {
    expect(ingest({ sourceText: () => undefined })).toEqual([]);
    expect(ingest({ sourceText: undefined })).toEqual([]);
    expect(ingest({}, reportOf([], []))).toEqual([]);
    expect(ingest({}, JSON.stringify({ files: { [FILE]: {} } }))).toEqual([]);
    expect(
      ingest({}, reportOf([[2, 3], 'x', [4], [null, 5]], [['a', 1], 7, [2, 4], [2, 6]])).map(
        (finding) => finding.location.line,
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

    expect(findings.map((finding) => finding.path)).toEqual([FILE]);
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

    expect(after.map((finding) => finding.identity)).toEqual(
      before.map((finding) => finding.identity),
    );
    expect(after[0].location.line).toBe(before[0].location.line + 2);
    expect(
      before.filter((finding) => !/^branch-source:[0-9a-f]{16}(#\d+)?$/.test(finding.identity)),
    ).toEqual([]);
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

    expect(new Set(findings.map((finding) => finding.identity)).size).toBe(4);
    expect(findings.every((finding) => !finding.identity.includes('#'))).toBe(true);
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

    expect(findings.map((finding) => finding.identity.replace(/^[^#]+/, ''))).toEqual([
      '',
      '#2',
      '#3',
    ]);
    expect(new Set(findings.map((finding) => finding.identity.split('#')[0])).size).toBe(1);
  });

  it('keeps the identity when the formatter changes quotes and spacing on the line', () => {
    const text = reportOf([], [[1, 2]]);
    const identity = (line) =>
      ingestCoverageBranches(text, { sourceText: () => `${line}\n    pass\n` }).findings[0]
        .identity;

    expect(identity("if name=='a' :")).toBe(identity('if name == "a":'));
    expect(identity('if name == "b":')).not.toBe(identity('if name == "a":'));
  });

  it('keeps the identity when ruff format moves a one-line body to its own line', () => {
    const text = reportOf([], [[1, 2]]);
    const identity = (source) =>
      ingestCoverageBranches(text, { sourceText: () => source }).findings[0].identity;

    expect(identity("if x == 1: print('v1')\n")).toBe(identity('if x == 1:\n    print("v1")\n'));
    expect(identity('if name == "a  b":\n    pass\n')).not.toBe(
      identity('if name == "a b":\n    pass\n'),
    );
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

    expect(result.newFindings.map((finding) => finding.location.line)).toEqual([13]);
    expect(
      result.unchangedFindings.map((finding) => finding.location.line).sort((a, b) => a - b),
    ).toEqual([2, 5, 7]);
  });

  it('fails a newly added uncovered branch', () => {
    const added = compareFindings({
      baseFindings: base.slice(0, 3),
      headFindings: base,
      touchedCode: touched(diffFor('@@ -12,0 +13,3 @@')),
    });

    expect(added.newFindings.map((finding) => finding.location.line)).toEqual([13]);
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

    expect(result.newFindings.map((finding) => finding.location.line)).toEqual([2]);
    expect(result.unchangedFindings.map((finding) => finding.location.line)).toEqual([8]);
  });

  it('applies to the Python tool only, not to the TypeScript coverage check of the same rule', () => {
    expect(isStrictRule('changed-branch-coverage', { tool: 'coverage-py' })).toBe(true);
    expect(isStrictRule('changed-branch-coverage', { tool: 'coverage' })).toBe(false);
  });
});
