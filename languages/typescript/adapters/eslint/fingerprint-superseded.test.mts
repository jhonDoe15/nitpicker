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
