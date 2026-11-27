import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { normalizeEslintResults } from './normalize.mts';
import { makeTemporaryRoot, positionOf } from './test-support/finding-for.mts';

describe('findings another rule already covers', () => {
  function normalized(code: string, reports: readonly (readonly [string, string])[]) {
    const root = makeTemporaryRoot('nitpicker-eslint-superseded-');
    mkdirSync(path.join(root, 'src'), { recursive: true });
    writeFileSync(path.join(root, 'src/rows.tsx'), code);
    const messages = reports.map(([ruleId, text]) => {
      const start = positionOf(code, code.indexOf(text));
      const end = positionOf(code, code.indexOf(text) + text.length);
      return {
        ruleId,
        message: `${ruleId} text`,
        severity: 2,
        ...start,
        endLine: end.line,
        endColumn: end.column,
      };
    });
    return normalizeEslintResults({
      value: [{ filePath: path.join(root, 'src/rows.tsx'), messages }],
      projectRoot: root,
      analyzerName: 'eslint-lint',
    }).map(({ rule }) => rule);
  }

  it('keeps only the key finding for a random key', () => {
    const code = 'export const row = <li key={Math.random()} />;\n';

    expect(
      normalized(code, [
        ['no-restricted-properties', 'Math.random'],
        ['nitpicker/react-no-random-key', 'Math.random()'],
      ]),
    ).toEqual(['nitpicker/react-no-random-key']);
  });

  it('keeps the restricted-property finding outside a key', () => {
    const code = 'export const row = <li key={id} data-seed={Math.random()} />;\n';

    expect(normalized(code, [['no-restricted-properties', 'Math.random']])).toEqual([
      'no-restricted-properties',
    ]);
  });
});

describe('ESLint output that is not a list of results', () => {
  function normalizing(value: unknown) {
    const root = makeTemporaryRoot('nitpicker-eslint-shape-');
    mkdirSync(path.join(root, 'src'), { recursive: true });
    writeFileSync(path.join(root, 'src/a.ts'), 'export const a = 1;\n');
    const resolved: unknown = JSON.parse(
      JSON.stringify(value).replaceAll('src/a.ts', path.join(root, 'src/a.ts')),
    );
    return () =>
      normalizeEslintResults({ value: resolved, projectRoot: root, analyzerName: 'eslint-lint' });
  }

  it('refuses output that is not an array', () => {
    expect(normalizing({})).toThrow('ESLint JSON output must be an array');
  });

  it('refuses a result without a file path or messages', () => {
    expect(normalizing([null])).toThrow('ESLint result 0 must contain filePath');
    expect(normalizing([{ filePath: 1, messages: [] }])).toThrow('must contain filePath');
    expect(normalizing([{ filePath: 'src/a.ts' }])).toThrow(
      'ESLint result 0 must contain messages',
    );
  });

  it('refuses a message that is not an object', () => {
    expect(normalizing([{ filePath: 'src/a.ts', messages: ['text'] }])).toThrow(
      'must be an object',
    );
  });
});
