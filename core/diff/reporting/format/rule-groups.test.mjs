import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderConsoleSummary } from '../summary.mjs';
import { areaOf } from './finding-areas.mjs';

const SAMPLE = JSON.parse(
  readFileSync(path.join(import.meta.dirname, 'fixtures/typescript-change-findings.json'), 'utf8'),
);
const DIAGNOSTICS = 'Full diagnostics: reports/quality/diff/combined/report.txt';

function route(entry, list = 'exceptions') {
  return `If this is intended, add ${JSON.stringify({ ...entry, reason: '...' })} to "${list}" in nitpicker.config.json.`;
}

function finding({ tool, rule, file, line, column, message, entry, list }) {
  return {
    tool,
    rule,
    path: file,
    message: entry === undefined ? message : `${message} ${route(entry, list)}`,
    classification: 'enforceable',
    ...(line === undefined
      ? {}
      : { location: { line, ...(column === undefined ? {} : { column }) } }),
  };
}

function summaryLines(newFindings, options = {}) {
  return renderConsoleSummary(
    { newFindings, toolErrors: [], unchangedFindings: options.held ?? [] },
    { color: false, ...options },
  ).split('\n');
}

const MAGIC = 'Name it with a module-level constant.';
const magic = (file, line, value) =>
  finding({
    tool: 'eslint-lint',
    rule: 'nitpicker/no-magic-numbers',
    file,
    line,
    column: 3,
    message: `No magic number: ${value}. ${MAGIC}`,
    entry: { rule: 'nitpicker/no-magic-numbers', paths: [file] },
  });

describe('console summary grouped by rule', () => {
  it('prints a sample change in well under half the bytes of the full messages', () => {
    const compact = renderConsoleSummary({ newFindings: SAMPLE, toolErrors: [] }, { color: false });
    const full = renderConsoleSummary(
      { newFindings: SAMPLE, toolErrors: [] },
      { color: false, details: true },
    );
    const labels = new Set(SAMPLE.map(({ tool, rule }) => `${tool}/${rule}`));
    const lines = compact.split('\n');

    expect(compact.length).toBeLessThan(full.length * 0.5);
    expect(lines.slice(0, 4)).toEqual([
      '',
      'Quality gate summary',
      '✖ 65 new enforceable violations',
      '  by area: lint 25 · structure 1 · coverage 3 · crap 1 · mutation 35',
    ]);
    expect(lines.filter((line) => /^ {2}\S+\/\S+/u.test(line))).toHaveLength(labels.size);
    expect(compact.match(/If this is intended/gu)).toHaveLength(labels.size);
    expect(full.match(/If this is intended/gu).length).toBeGreaterThan(labels.size * 3);
  });

  it('prints the shared advice once and the differing part per location', () => {
    expect(
      summaryLines([
        magic('src/b.ts', 4, '3'),
        magic('src/a.ts', 9, '7'),
        magic('src/b.ts', 2, '4'),
      ]),
    ).toEqual([
      '',
      'Quality gate summary',
      '✖ 3 new enforceable violations',
      `  eslint-lint/nitpicker/no-magic-numbers: ${MAGIC}`,
      '    src/a.ts:9:3 No magic number: 7.',
      '    src/b.ts:2:3 No magic number: 4.',
      '    src/b.ts:4:3 No magic number: 3.',
      `    ${route({ rule: 'nitpicker/no-magic-numbers', paths: ['<path>'] })}`,
      DIAGNOSTICS,
      '',
    ]);
  });

  it('keeps the exact exception entry when every finding of the rule shares it', () => {
    const lines = summaryLines([magic('src/a.ts', 9, '7'), magic('src/a.ts', 12, '8')]);

    expect(lines.slice(3)).toEqual([
      `  eslint-lint/nitpicker/no-magic-numbers: ${MAGIC}`,
      '    src/a.ts:9:3 No magic number: 7.',
      '    src/a.ts:12:3 No magic number: 8.',
      `    ${route({ rule: 'nitpicker/no-magic-numbers', paths: ['src/a.ts'] })}`,
      DIAGNOSTICS,
      '',
    ]);
  });

  it('groups Java findings of one rule across files and marks every differing entry field', () => {
    const crap = (file, line, name) =>
      finding({
        tool: 'crap',
        rule: 'crap-score-limit',
        file,
        line,
        message: `${name} has CRAP 30.00; score must be below 9. Test its uncovered branches.`,
        entry: { rule: 'crap-score-limit', paths: [file], function: name },
      });
    const lines = summaryLines([
      crap('src/main/java/demo/B.java', 3, 'total'),
      crap('src/main/java/demo/A.java', 8, 'price'),
    ]);

    expect(lines.slice(3, -2)).toEqual([
      '  crap/crap-score-limit: Test its uncovered branches.',
      '    src/main/java/demo/A.java:8 (function price) price has CRAP 30.00; score must be below 9.',
      '    src/main/java/demo/B.java:3 (function total) total has CRAP 30.00; score must be below 9.',
      `    ${route({ rule: 'crap-score-limit', paths: ['<path>'], function: '<function>' })}`,
    ]);
  });

  it('keeps the Python exception list in the once-per-rule entry', () => {
    const mutable = (file, line) =>
      finding({
        tool: 'ruff',
        rule: 'B006',
        file,
        line,
        column: 1,
        message: 'Do not use mutable data structures for argument defaults.',
        entry: { rule: 'B006', paths: [file] },
        list: 'python.exceptions',
      });

    expect(
      summaryLines([mutable('src/demo/a.py', 2), mutable('src/demo/b.py', 5)]).slice(3, -2),
    ).toEqual([
      '  ruff/B006: Do not use mutable data structures for argument defaults.',
      '    src/demo/a.py:2:1',
      '    src/demo/b.py:5:1',
      `    ${route({ rule: 'B006', paths: ['<path>'] }, 'python.exceptions')}`,
    ]);
  });

  it('orders rules by fix order, then by path and line, and counts each area', () => {
    const mutant = finding({
      tool: 'pit',
      rule: 'mutant-survived',
      file: 'src/main/java/demo/A.java',
      line: 1,
      message: 'Survived. Add an assertion that would.',
    });
    const format = finding({
      tool: 'google-java-format',
      rule: 'format',
      file: 'src/main/java/demo/Z.java',
      message: 'Format it.',
    });
    const lint = finding({
      tool: 'pmd',
      rule: 'UnusedPrivateField',
      file: 'src/main/java/demo/B.java',
      line: 4,
      message: 'Remove the field.',
    });
    const lines = summaryLines([mutant, lint, format]);

    expect(lines.filter((line) => line.startsWith('  ') && !line.startsWith('    '))).toEqual([
      '  by area: format 1 · lint 1 · mutation 1',
      '  google-java-format/format: Format it.',
      '  pmd/UnusedPrivateField: Remove the field.',
      '  pit/mutant-survived: Survived. Add an assertion that would.',
    ]);
  });

  it('counts repeated findings without a location', () => {
    const unplaced = finding({
      tool: 'custom',
      rule: 'text',
      file: 'a.txt',
      message: 'Text file.',
    });

    expect(summaryLines([unplaced, unplaced]).slice(3, -2)).toEqual([
      '  custom/text: Text file.',
      '    a.txt (2 times)',
    ]);
  });

  it('keeps the glob suffix of folder entries in the placeholder', () => {
    const folder = (file) =>
      finding({
        tool: 'structure',
        rule: 'folder-files-limit',
        file,
        message: 'Folder has 7 files (limit 6).',
        entry: { rule: 'folder-files-limit', paths: [`${file}/*`] },
      });

    expect(summaryLines([folder('src/a'), folder('src/b')]).at(-3)).toBe(
      `    ${route({ rule: 'folder-files-limit', paths: ['<path>/*'] })}`,
    );
  });

  it('names the differing function of each place and keeps places without a location', () => {
    const branch = (line, name) =>
      finding({
        tool: 'coverage',
        rule: 'changed-branch-coverage',
        file: 'src/x.ts',
        line,
        message: 'Branch coverage is 0.00%.',
        entry: { rule: 'changed-branch-coverage', paths: ['src/x.ts'], function: name },
      });
    const unplaced = branch(undefined, 'total');

    expect(summaryLines([branch(9, 'price'), branch(3, 'price'), unplaced]).slice(3, -2)).toEqual([
      '  coverage/changed-branch-coverage: Branch coverage is 0.00%.',
      '    src/x.ts (function total)',
      '    src/x.ts:3, 9 (function price)',
      `    ${route({ rule: 'changed-branch-coverage', paths: ['src/x.ts'], function: '<function>' })}`,
    ]);
  });

  it('marks the path a placeholder when some places have no exception entry', () => {
    const rule = (file, entry) =>
      finding({ tool: 'python-rules', rule: 'r', file, line: 1, message: 'Fix it.', entry });
    const lines = summaryLines([rule('a.py', { rule: 'r', paths: ['a.py'] }), rule('c.py')]);

    expect(lines.at(-3)).toBe(`    ${route({ rule: 'r', paths: ['<path>'] })}`);
  });

  it('counts repeats of one place and places without a location next to placed ones', () => {
    const dependency = (line) =>
      finding({
        tool: 'dead-code',
        rule: 'dependencies',
        file: 'package.json',
        line,
        message: 'Unused.',
      });
    const unplaced = dependency(undefined);

    expect(summaryLines([dependency(1), dependency(1), unplaced]).slice(3, -2)).toEqual([
      '  dead-code/dependencies: Unused.',
      '    package.json:1 (2 times) (+1 without a location)',
    ]);
  });

  it('leaves a message whose exception entry is not JSON as it is', () => {
    const odd = finding({
      tool: 'custom',
      rule: 'odd',
      file: 'a.ts',
      line: 1,
      message: 'Odd. If this is intended, add {not json} to "exceptions" in nitpicker.config.json.',
    });

    expect(summaryLines([odd]).slice(3, -2)).toEqual([
      '  custom/odd: Odd. If this is intended, add {not json} to "exceptions" in nitpicker.config.json.',
      '    a.ts:1',
    ]);
  });
});

describe('held findings in the console summary', () => {
  const held = (line) => ({
    ...finding({
      tool: 'eslint-lint',
      rule: 'no-console',
      file: 'src/a.ts',
      line,
      message: 'Use the logger.',
      entry: { rule: 'no-console', paths: ['src/a.ts'] },
    }),
    heldAtBase: 12,
    ratchet: { value: 12 },
  });
  const twelve = Array.from({ length: 12 }, (_, index) => held(index + 1));

  it('lists at most ten held findings, without their exception entries', () => {
    const lines = summaryLines([], { held: twelve });

    expect(lines.slice(3, -2)).toEqual([
      'Note: 12 existing lint findings in edited code (not failing, no more than before):',
      ...twelve
        .slice(0, 10)
        .map(
          (_, index) =>
            `  eslint-lint/no-console src/a.ts:${String(index + 1)} Use the logger. (12 at base and now; any increase fails)`,
        ),
      '  … 2 more; see reports/quality/diff/combined/report.txt',
    ]);
  });

  it('lists every held finding with its full message with --details', () => {
    const lines = summaryLines([], { held: twelve, details: true });

    expect(lines.filter((line) => line.startsWith('  eslint-lint/no-console'))).toHaveLength(12);
    expect(lines.filter((line) => line.includes('If this is intended'))).toHaveLength(12);
  });
});

describe('finding areas', () => {
  const PRESET_TOOLS = {
    typescript: [
      'eslint-lint',
      'eslint-errors',
      'eslint-logging',
      'eslint-module-effects',
      'entry-points',
      'prettier-format',
      'typescript-typecheck',
      'dependency-architecture',
      'coding-standards',
      'coupling',
      'test-runtime',
      'structure',
      'duplicates',
      'dead-code',
      'coverage',
      'test-console',
      'crap',
      'mutation',
      'repository-hygiene',
      'change-history',
    ],
    java: [
      'pmd',
      'spotbugs',
      'errorprone',
      'checkstyle',
      'archunit',
      'spring',
      'google-java-format',
      'palantir-java-format',
      'jacoco',
      'pit',
    ],
    kotlin: ['detekt', 'ktlint', 'ktfmt', 'kotlin-source', 'kotlinc'],
    python: [
      'ruff',
      'ruff-format',
      'black',
      'python-rules',
      'import-linter',
      'dependencies',
      'mypy',
      'pyright',
      'basedpyright',
      'coverage-py',
      'mutmut',
    ],
    go: ['gofmt', 'gofumpt', 'goimports', 'build', 'vet', 'tests', 'facts'],
  };

  it.each(Object.entries(PRESET_TOOLS))(
    'places every %s tool in a fix-order area',
    (_preset, tools) => {
      expect(tools.filter((tool) => areaOf(tool) === 'other')).toEqual([]);
    },
  );
});
