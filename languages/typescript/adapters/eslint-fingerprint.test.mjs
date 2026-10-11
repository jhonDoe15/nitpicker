import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { compareFindings } from '../../../core/diff/compare.mjs';
import { isStrictRule } from '../preset/strict-rules.mjs';
import { normalizeEslintResults } from './eslint-runner.mjs';

const temporaryRoots = [];

afterAll(() => {
  for (const root of temporaryRoots) {
    rmSync(root, { recursive: true, force: true });
  }
});

function positionOf(code, offset) {
  const before = code.slice(0, offset).split('\n');
  return { line: before.length, column: (before.at(-1)?.length ?? 0) + 1 };
}

// Normalizes ESLint messages that point at `reported` (a substring of `code`, or a list of them,
// one message each), the way ESLint reports them: a 1-based start and end.
function findingFor({
  code,
  reported,
  ruleId = 'functional/prefer-immutable-types',
  messageId,
  message = 'Reported text.',
}) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-eslint-fingerprint-'));
  temporaryRoots.push(root);
  mkdirSync(path.join(root, 'src'), { recursive: true });
  writeFileSync(path.join(root, 'src/legacy.ts'), code);
  const reportedTexts = [reported].flat();
  const messages = reportedTexts.map((text, index) => {
    const start = code.indexOf(text, index === 0 ? 0 : code.indexOf(reportedTexts[index - 1]) + 1);
    const first = positionOf(code, start);
    const last = positionOf(code, start + text.length);
    return {
      ruleId,
      messageId,
      message,
      severity: 2,
      line: first.line,
      column: first.column,
      endLine: last.line,
      endColumn: last.column,
    };
  });
  const findings = normalizeEslintResults({
    value: [{ filePath: path.join(root, 'src/legacy.ts'), messages }],
    projectRoot: root,
    analyzerName: 'eslint-strict',
  });
  expect(findings).toHaveLength(reportedTexts.length);
  return findings;
}

function compare(base, head) {
  return compareFindings({ baseFindings: base, headFindings: head });
}

const returnTypeFinding = (code) => findingFor({ code, reported: ': Item[]' });

describe('a finding anchored on a whole function is about its signature', () => {
  const before = [
    'export function discounted(items: readonly Item[]): Item[] {',
    '  const first = items[0];',
    '  return items.filter((item) => item !== first);',
    '}',
    '',
  ].join('\n');

  it('stays baselined when only the function body changes', () => {
    const after = before.replace(
      '  return',
      '  const rate = 2;\n  if (rate > 1) {\n    return [];\n  }\n  return',
    );

    const result = compare(returnTypeFinding(before), returnTypeFinding(after));

    expect(result.newFindings).toEqual([]);
    expect(result.resolvedFindings).toEqual([]);
    expect(result.unchangedFindings).toHaveLength(1);
  });

  it('stays baselined when lines are added above the function', () => {
    const result = compare(
      returnTypeFinding(before),
      returnTypeFinding(`export const rate = 1;\n\n${before}`),
    );

    expect(result.newFindings).toEqual([]);
    expect(result.unchangedFindings).toHaveLength(1);
  });

  it('changes the identity when the signature changes', () => {
    const after = before.replace('items: readonly Item[]', 'items: readonly Item[], rate: number');

    expect(returnTypeFinding(after)[0].identity).not.toBe(returnTypeFinding(before)[0].identity);
  });

  it('keeps a body-anchored finding tied to the text it reports', () => {
    const call = (argument) => `export function run() {\n  console.log(${argument});\n}\n`;
    const find = (code) =>
      findingFor({ code, reported: code.slice(code.indexOf('console'), code.indexOf(';')) });

    expect(find(call('1'))[0].identity).toBe(find(call('1'))[0].identity);
    expect(find(call('2'))[0].identity).not.toBe(find(call('1'))[0].identity);
  });

  it('keeps a declaration without a body tied to its whole text', () => {
    const find = (code) => findingFor({ code, reported: code.trim() });

    const result = compare(
      find('declare function load(id: string): Item;\n'),
      find('declare function load(id: number): Item;\n'),
    );

    expect(result.newFindings).toHaveLength(1);
  });
});

describe('a finding in an edited function stays baselined while the function has no more of them', () => {
  const SILENT = 'nitpicker/no-silent-catch';
  const originalHandler = "\n    return '';\n  ";
  const rewrittenHandler = "\n    const fallback = '';\n    return fallback;\n  ";

  function load(handler, extra = '') {
    return [
      'export function load(read: () => string): string {',
      '  try {',
      '    return read();',
      `  } catch {${handler}}`,
      '}',
      extra,
    ].join('\n');
  }

  const silentCatches = (code) =>
    findingFor({
      code,
      reported: [...code.matchAll(/catch \{[^}]*\}/g)].map(([reported]) => reported),
      ruleId: SILENT,
    });

  function compareWithTouched(before, after, touchedLines, inserted = []) {
    return compareFindings({
      baseFindings: silentCatches(before),
      headFindings: silentCatches(after),
      touchedCode: {
        changedLines: new Map([
          ['src/legacy.ts', { added: false, ranges: touchedLines, inserted }],
        ]),
        isStrictRule,
      },
    });
  }

  it('keeps a rewritten catch body baselined when its first line is untouched', () => {
    const result = compareWithTouched(load(originalHandler), load(rewrittenHandler), [[5, 6]]);

    expect(result.newFindings).toEqual([]);
    expect(result.resolvedFindings).toEqual([]);
    expect(result.unchangedFindings).toMatchObject([{ rule: SILENT, heldAtBase: 1 }]);
  });

  it('keeps a catch whose own line the change edited baselined', () => {
    const result = compareWithTouched(load(originalHandler), load(rewrittenHandler), [[4, 6]]);

    expect(result.newFindings).toEqual([]);
    expect(result.unchangedFindings).toMatchObject([{ rule: SILENT, heldAtBase: 1 }]);
  });

  it('fails a catch on a line the change added', () => {
    const result = compareWithTouched(
      load(originalHandler),
      load(rewrittenHandler),
      [[4, 6]],
      [[4, 6]],
    );

    expect(result.newFindings).toHaveLength(1);
  });

  it('fails a second silent catch in the same function', () => {
    const twice = load(originalHandler).replace(
      '  try {',
      `  try {\n    read();\n  } catch {${originalHandler}}\n  try {`,
    );

    const result = compareWithTouched(load(originalHandler), twice, []);

    expect(result.newFindings).toHaveLength(1);
  });

  it('fails a silent catch in another function', () => {
    const other = load(rewrittenHandler, '').replace('function load', 'function fetchValue');

    const result = compareWithTouched(
      load(originalHandler),
      `${load(rewrittenHandler)}\n${other}`,
      [[5, 6]],
    );

    expect(result.newFindings).toMatchObject([{ symbol: 'fetchValue' }]);
  });

  it('keeps a lint finding of a non-strict rule baselined when its code is edited', () => {
    const find = (argument) =>
      findingFor({
        code: `export function run(a: string) {\n  return a.concat(${argument});\n}\n`,
        reported: `a.concat(${argument})`,
        ruleId: '@typescript-eslint/prefer-includes',
      });

    const result = compare(find('"1"'), find('"22"'));

    expect(result.newFindings).toEqual([]);
    expect(result.unchangedFindings).toHaveLength(1);
  });
});

describe('a complexity finding fails only when the number rises', () => {
  const complexity = (amount) =>
    `Refactor this function to reduce its Cognitive Complexity from ${String(amount)} to the 15 allowed.`;

  const arrow = (body) => `export const total = (items: readonly Item[]) => {\n${body}\n};\n`;
  const named = (body) => `export function total(items: readonly Item[]) {\n${body}\n}\n`;

  const cases = [
    ['an arrow function, reported at its arrow', arrow, '=>'],
    ['a named function, reported at its name', named, 'total'],
  ];

  function find(build, reported, amount, body = '  return 1;') {
    return findingFor({
      code: build(body),
      reported,
      ruleId: 'sonarjs/cognitive-complexity',
      messageId: 'refactorFunction',
      message: complexity(amount),
    });
  }

  it.each(cases)(
    'keeps %s baselined when the body is edited and the number is the same',
    (_name, build, reported) => {
      const result = compare(
        find(build, reported, 16),
        find(build, reported, 16, '  const a = 1;\n  return a;'),
      );

      expect(result.newFindings).toEqual([]);
      expect(result.resolvedFindings).toEqual([]);
    },
  );

  it.each(cases)('fails %s when the number rises and says from what', (_name, build, reported) => {
    const result = compare(find(build, reported, 16), find(build, reported, 60));

    expect(result.newFindings.map(({ message }) => message)).toEqual([
      'total cognitive complexity grew from 16 to 60. Put new code in a new function.',
    ]);
  });

  it.each(cases)('holds %s when the number falls but is still over', (_name, build, reported) => {
    const result = compare(find(build, reported, 16), find(build, reported, 12));

    expect(result.newFindings).toEqual([]);
    expect(result.unchangedFindings).toMatchObject([
      { rule: 'sonarjs/cognitive-complexity', heldAtBase: 16 },
    ]);
  });

  it.each(cases)('fails %s that is over the limit for the first time', (_name, build, reported) => {
    const result = compare([], find(build, reported, 16));

    expect(result.newFindings.map(({ message }) => message)).toEqual([complexity(16)]);
  });
});
