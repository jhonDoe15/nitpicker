import { describe, expect, it } from 'vitest';
import { normalizeDuplicates } from '../../../../../languages/typescript/preset/duplicates/normalize.mjs';

describe('duplicate findings in the quality-area analyzers', () => {
  it('reports a helper copied between test files but not repeated expected data', () => {
    const clone = (fragment) => ({
      firstFile: { name: 'test/a.test.ts', start: 2 },
      secondFile: { name: 'test/b.test.ts', start: 7 },
      fragment,
      lines: 12,
      tokens: 80,
    });
    const isTestFile = (file) => file.startsWith('test/');
    const failures = (fragments) =>
      normalizeDuplicates(
        { duplicates: fragments.map((fragment) => clone(fragment)) },
        'duplicates',
        { configuredPaths: [], isTestFile },
      ).filter(({ rule }) => rule === 'duplicate-clone');
    const helpers = [
      'function capture() {\n  const writes = [];\n  return writes;\n}',
      'const lines = (text: string) => text.split("\\n");',
    ];
    const data = [
      "expect(total).toEqual({\n  lines: ['Subtotal: $20.00'],\n  totalCents: 2759,\n});",
      "it('totals the order', () => {\n  expect(total()).toBe(3);\n});",
    ];

    expect(failures([...helpers, ...data])).toEqual(failures(helpers));
    expect(failures(helpers)).toHaveLength(2);
  });
  it('normalizes duplicate clone size as descriptive metrics', () => {
    const findings = normalizeDuplicates(
      {
        duplicates: [
          {
            firstFile: { name: 'a.ts', start: 2 },
            secondFile: { name: 'b.ts', start: 7 },
            lines: 10,
            tokens: 30,
          },
        ],
      },
      'duplicates',
      { configuredPaths: ['src/main'] },
    );

    expect(findings).toEqual([
      {
        tool: 'duplicates',
        rule: 'duplicate-clone',
        path: 'src/main/a.ts',
        identity: 'pair:src/main/a.ts|src/main/b.ts:fragment:e3b0c44298fc1c149afbf4c8:occurrence:1',
        message:
          'This code repeats src/main/b.ts:7 (10 lines). Keep one copy and call it from both places.',
        classification: 'enforceable',
        location: { line: 2 },
        ratchet: {
          key: 'pair:src/main/a.ts|src/main/b.ts:clone',
          value: 30,
          divisible: true,
          mustKeepUnchangedLines: [
            { path: 'src/main/a.ts', startLine: 2, endLine: 11 },
            { path: 'src/main/b.ts', startLine: 7, endLine: 16 },
          ],
        },
      },
      {
        tool: 'duplicates',
        rule: 'duplicate-clone-size',
        path: 'src/main/a.ts',
        identity: 'pair:src/main/a.ts|src/main/b.ts:occurrence:1:lines',
        message: 'Duplicate with src/main/b.ts',
        classification: 'descriptive',
        metric: { name: 'lines', value: 10 },
        location: { line: 2 },
      },
      {
        tool: 'duplicates',
        rule: 'duplicate-clone-size',
        path: 'src/main/a.ts',
        identity: 'pair:src/main/a.ts|src/main/b.ts:occurrence:1:tokens',
        message: 'Duplicate with src/main/b.ts',
        classification: 'descriptive',
        metric: { name: 'tokens', value: 30 },
        location: { line: 2 },
      },
    ]);
  });
  it('keeps canonical duplicate paths and locations aligned', () => {
    const findings = normalizeDuplicates(
      {
        duplicates: [
          {
            firstFile: { name: 'src/main/z.ts', start: 2 },
            secondFile: { name: 'src/main/a.ts', start: 7 },
            lines: 10,
            tokens: 30,
          },
        ],
      },
      'duplicates',
      { configuredPaths: ['src/main'] },
    );

    expect(findings).toEqual([
      {
        tool: 'duplicates',
        rule: 'duplicate-clone',
        path: 'src/main/a.ts',
        identity: 'pair:src/main/a.ts|src/main/z.ts:fragment:e3b0c44298fc1c149afbf4c8:occurrence:1',
        message:
          'This code repeats src/main/z.ts:2 (10 lines). Keep one copy and call it from both places.',
        classification: 'enforceable',
        location: { line: 7 },
        ratchet: {
          key: 'pair:src/main/a.ts|src/main/z.ts:clone',
          value: 30,
          divisible: true,
          mustKeepUnchangedLines: [
            { path: 'src/main/a.ts', startLine: 7, endLine: 16 },
            { path: 'src/main/z.ts', startLine: 2, endLine: 11 },
          ],
        },
      },
      {
        tool: 'duplicates',
        rule: 'duplicate-clone-size',
        path: 'src/main/a.ts',
        identity: 'pair:src/main/a.ts|src/main/z.ts:occurrence:1:lines',
        message: 'Duplicate with src/main/z.ts',
        classification: 'descriptive',
        metric: { name: 'lines', value: 10 },
        location: { line: 7 },
      },
      {
        tool: 'duplicates',
        rule: 'duplicate-clone-size',
        path: 'src/main/a.ts',
        identity: 'pair:src/main/a.ts|src/main/z.ts:occurrence:1:tokens',
        message: 'Duplicate with src/main/z.ts',
        classification: 'descriptive',
        metric: { name: 'tokens', value: 30 },
        location: { line: 7 },
      },
    ]);
  });
});
