import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { measureCrap } from './measure.mjs';

const temporaryRoots = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

const SOURCE = ['export function twice(value) {', '  return value * 2;', '}'].join('\n');

const position = (line, column) => ({ line, column });
const span = (startLine, startColumn, endLine, endColumn) => ({
  start: position(startLine, startColumn),
  end: position(endLine, endColumn),
});

const coverageEntry = (file, hits = 1) => ({
  path: file,
  statementMap: { 0: span(2, 2, 2, 20) },
  s: { 0: hits },
  branchMap: {},
  b: {},
  fnMap: { 0: { name: 'twice', decl: span(1, 16, 1, 21), loc: span(1, 0, 3, 1), line: 1 } },
  f: { 0: hits },
});

function project(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-crap-measure-'));
  temporaryRoots.push(root);
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(path.join(root, name), text);
  }
  return root;
}

function measure(root, files = ['src/a.ts']) {
  const analysis = measureCrap(
    root,
    files.map((file) => path.join(root, file)),
    { extensions: ['ts'], excludes: [], coverageReportPath: path.join(root, 'coverage.json') },
  );
  return {
    functions: analysis.metrics.map(({ displayName, complexity, coverage, crapScore }) => [
      displayName,
      complexity,
      coverage,
      crapScore,
    ]),
    warnings: analysis.warnings.map((warning) => warning.replace(root, '<root>')),
  };
}

const measuredAt = (percent) => ({ percent, status: 'measured', unknownReason: undefined });
const unknownBecause = (unknownReason) => ({
  percent: undefined,
  status: 'unknown',
  unknownReason,
});

describe('measureCrap', () => {
  it('scores a function from the coverage entry of its file', () => {
    const root = project({
      'src/a.ts': SOURCE,
      'coverage.json': '{}',
    });
    writeFileSync(
      path.join(root, 'coverage.json'),
      JSON.stringify({
        [path.join(root, 'src/a.ts')]: coverageEntry(path.join(root, 'src/a.ts'), 0),
      }),
    );

    expect(measure(root)).toEqual({
      functions: [['twice', 1, measuredAt(0), 2]],
      warnings: [],
    });
  });

  it('matches an entry written relative to the project and one that differs only by case', () => {
    const relative = project({
      'src/a.ts': SOURCE,
      'coverage.json': JSON.stringify({ 'src/a.ts': coverageEntry('src/a.ts') }),
    });
    const cased = project({
      'src/a.ts': SOURCE,
      'coverage.json': '{}',
    });
    writeFileSync(
      path.join(cased, 'coverage.json'),
      JSON.stringify({
        [path.join(cased, 'SRC/A.ts')]: coverageEntry(path.join(cased, 'SRC/A.ts')),
      }),
    );

    expect([measure(relative).functions, measure(cased).functions]).toEqual([
      [['twice', 1, measuredAt(100), 1]],
      [['twice', 1, measuredAt(100), 1]],
    ]);
  });

  it('falls back to a suffix match, but not when two entries match', () => {
    const unique = project({
      'src/a.ts': SOURCE,
      'coverage.json': JSON.stringify({
        '/elsewhere/src/a.ts': coverageEntry('/elsewhere/src/a.ts'),
      }),
    });
    const ambiguous = project({
      'src/a.ts': SOURCE,
      'coverage.json': JSON.stringify({
        '/one/src/a.ts': coverageEntry('/one/src/a.ts'),
        '/two/src/a.ts': coverageEntry('/two/src/a.ts'),
      }),
    });

    expect([measure(unique), measure(ambiguous)]).toEqual([
      { functions: [['twice', 1, measuredAt(100), 1]], warnings: [] },
      {
        functions: [['twice', 1, unknownBecause('file_ambiguous'), undefined]],
        warnings: [
          'Warning: Coverage for src/a.ts matched 2 report entries by suffix. Coverage will be N/A.',
        ],
      },
    ]);
  });

  it('reports why coverage is unknown when the report is missing, unreadable or lacks the file', () => {
    const missing = project({ 'src/a.ts': SOURCE });
    const unreadable = project({ 'src/a.ts': SOURCE, 'coverage.json': '{' });
    const unmatched = project({ 'src/a.ts': SOURCE, 'coverage.json': '{}' });

    expect([missing, unreadable, unmatched].map((root) => measure(root))).toEqual([
      {
        functions: [['twice', 1, unknownBecause('missing_report'), undefined]],
        warnings: [
          'Warning: Coverage report not found at <root>/coverage.json. Coverage will be N/A.',
        ],
      },
      {
        functions: [['twice', 1, unknownBecause('unparseable_report'), undefined]],
        warnings: [
          'Warning: Coverage report at <root>/coverage.json could not be parsed. Coverage will be N/A.',
        ],
      },
      {
        functions: [['twice', 1, unknownBecause('file_unmatched'), undefined]],
        warnings: [],
      },
    ]);
  });

  it('skips a file that does not parse and says so', () => {
    const root = project({
      'src/a.ts': SOURCE,
      'src/broken.ts': 'export function broken( {',
      'coverage.json': '{}',
    });

    const { functions, warnings } = measure(root, ['src/a.ts', 'src/broken.ts']);

    expect(functions).toEqual([['twice', 1, unknownBecause('file_unmatched'), undefined]]);
    expect(warnings).toEqual([
      "Warning: Could not parse src/broken.ts: Unable to parse TypeScript source <root>/src/broken.ts: '}' expected.. Skipping file.",
    ]);
  });
});
