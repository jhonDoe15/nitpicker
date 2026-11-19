import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { normalizeEslintResults } from './normalize.mts';

const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-report-only-')));
const file = path.join(root, 'src/a.ts');
mkdirSync(path.dirname(file));
writeFileSync(file, 'export const a = 1;\n');

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

function classificationOf(ruleId: string): string | undefined {
  const [finding] = normalizeEslintResults({
    value: [
      {
        filePath: file,
        messages: [{ ruleId, severity: 2, message: 'x', line: 1, column: 1 }],
      },
    ],
    projectRoot: root,
    analyzerName: 'eslint-lint',
  });
  return finding?.classification;
}

describe('report-only ESLint rules', () => {
  it.each([
    ['nitpicker/no-presence-truthiness', 'descriptive'],
    ['nitpicker/no-empty-every-signal', 'descriptive'],
    ['nitpicker/no-decided-condition', 'enforceable'],
  ])('classifies %s as %s', (ruleId, expected) => {
    expect(classificationOf(ruleId)).toBe(expected);
  });
});
