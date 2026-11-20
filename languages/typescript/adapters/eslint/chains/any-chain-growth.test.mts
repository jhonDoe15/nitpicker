import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { normalizeEslintResults } from '../normalize.mts';
import { makeTemporaryRoot } from '../test-support/finding-for.mts';
import { compareFindings, firstOf } from '../test-support/finding-comparison.mts';

function sourceWithReads(count: number): string {
  const reads = Array.from({ length: count }, (_, index) => `value.field${String(index)}`);
  return `export function read(value: any) {\n  return [${reads.join(', ')}];\n}\n`;
}

function findingsFor(count: number): ReturnType<typeof normalizeEslintResults> {
  const root = makeTemporaryRoot('nitpicker-any-chain-');
  mkdirSync(path.join(root, 'src'), { recursive: true });
  const code = sourceWithReads(count);
  writeFileSync(path.join(root, 'src/read.ts'), code);
  const lineText = code.split('\n')[1] ?? '';
  const messages = Array.from({ length: count }, (_, index) => {
    const needle = `value.field${String(index)}`;
    const column = lineText.indexOf(needle) + 1;
    return {
      ruleId: '@typescript-eslint/no-unsafe-member-access',
      messageId: 'unsafeMemberExpression',
      message: `Unsafe member access .field${String(index)} on an \`any\` value.`,
      severity: 2,
      line: 2,
      column: column + 6,
      endLine: 2,
      endColumn: column + needle.length,
    };
  });
  return normalizeEslintResults({
    value: [{ filePath: path.join(root, 'src/read.ts'), messages }],
    projectRoot: root,
    analyzerName: 'eslint-lint',
  });
}

function compared(baseCount: number, headCount: number): ReturnType<typeof compareFindings> {
  return compareFindings({
    baseFindings: findingsFor(baseCount),
    headFindings: findingsFor(headCount),
    touchedCode: undefined,
  });
}

describe('an any chain reported once', () => {
  it('counts every use of the chain in its ratchet', () => {
    const findings = findingsFor(4);

    expect(findings).toHaveLength(1);
    expect(firstOf(findings).ratchet?.value).toBe(4);
    expect(firstOf(findings).message.split(' If ')[0]).toBe(
      'Unsafe use of the `any` value `value` in read: it affects 4 places.',
    );
  });

  it('holds an unchanged or shrunk chain from the base', () => {
    expect(compared(3, 3).newFindings).toEqual([]);
    expect(compared(3, 2).newFindings).toEqual([]);
    expect(compared(3, 1).newFindings).toEqual([]);
  });

  it('reports a chain that grows past the base', () => {
    const { newFindings } = compared(3, 4);

    expect(newFindings).toHaveLength(1);
    expect(firstOf(newFindings).ratchet?.value).toBe(4);
  });
});

type Report = { readonly ruleId: string; readonly needle: string; readonly text: string };

const MEMBER_RULE = '@typescript-eslint/no-unsafe-member-access';
const RETURN_RULE = '@typescript-eslint/no-unsafe-return';

function member(name: string): Report {
  return {
    ruleId: MEMBER_RULE,
    needle: `.${name}`,
    text: `Unsafe member access .${name} on an \`any\` value.`,
  };
}

function returned(needle: string): Report {
  return { ruleId: RETURN_RULE, needle, text: 'Unsafe return of a value of type `any`.' };
}

function findingsOfCode(
  code: string,
  reports: readonly Report[],
): ReturnType<typeof normalizeEslintResults> {
  const root = makeTemporaryRoot('nitpicker-any-chain-');
  mkdirSync(path.join(root, 'src'), { recursive: true });
  writeFileSync(path.join(root, 'src/read.ts'), code);
  const messages = reports.map(({ ruleId, needle, text }) => {
    const start = code.indexOf(needle) + (needle.startsWith('.') ? 1 : 0);
    const before = code.slice(0, start).split('\n');
    const lastLine = before.at(-1) ?? '';
    const length = needle.replace(/^\./u, '').length;
    return {
      ruleId,
      message: text,
      severity: 2,
      line: before.length,
      column: lastLine.length + 1,
      endLine: before.length,
      endColumn: lastLine.length + 1 + length,
    };
  });
  return normalizeEslintResults({
    value: [{ filePath: path.join(root, 'src/read.ts'), messages }],
    projectRoot: root,
    analyzerName: 'eslint-lint',
  });
}

describe('an any chain across edits', () => {
  it('stays held when the top-ranked rule of the chain disappears', () => {
    const base = findingsOfCode(
      'export function read(value: any) {\n  const a = value.x;\n  return value;\n}\n',
      [member('x'), returned('return value')],
    );
    const head = findingsOfCode('export function read(value: any) {\n  return value;\n}\n', [
      returned('return value'),
    ]);

    expect(base).toHaveLength(1);
    expect(head).toHaveLength(1);
    expect(firstOf(head).rule).toBe(firstOf(base).rule);
    expect(
      compareFindings({ baseFindings: base, headFindings: head, touchedCode: undefined })
        .newFindings,
    ).toEqual([]);
  });

  it('stays held when the line of its first use is edited', () => {
    const base = findingsOfCode(
      'export function read(value: any) {\n  const a = value.x;\n  return [a, value.y];\n}\n',
      [member('x'), member('y')],
    );
    const head = findingsOfCode(
      'export function read(value: any) {\n  const renamed = value.x;\n  return [renamed, value.y];\n}\n',
      [member('x'), member('y')],
    );
    const touchedCode = {
      isStrictRule: () => true,
      changedLines: new Map([
        ['src/read.ts', { added: false, ranges: [[2, 3] as const], inserted: [] }],
      ]),
    };

    expect(
      compareFindings({ baseFindings: base, headFindings: head, touchedCode }).newFindings,
    ).toEqual([]);
  });

  it('keeps one finding per any parameter and reports only the one that grew', () => {
    const code = (a: readonly string[], b: readonly string[]): string =>
      `export function read(a: any, b: any) {\n  return [${[...a, ...b].join(', ')}];\n}\n`;
    const base = findingsOfCode(code(['a.p'], ['b.q']), [member('p'), member('q')]);
    const head = findingsOfCode(code(['a.p', 'a.r'], ['b.q']), [
      member('p'),
      member('r'),
      member('q'),
    ]);

    expect(base).toHaveLength(2);
    expect(head).toHaveLength(2);
    const { newFindings } = compareFindings({
      baseFindings: base,
      headFindings: head,
      touchedCode: undefined,
    });
    expect(newFindings).toHaveLength(1);
    expect(firstOf(newFindings).ratchet?.value).toBe(2);
  });
});
