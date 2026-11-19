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
  it('classifies the presence truthiness rule as descriptive', () => {
    expect(classificationOf('nitpicker/no-presence-truthiness')).toBe('descriptive');
  });

  it('keeps other rules enforceable', () => {
    expect(classificationOf('nitpicker/no-decided-condition')).toBe('enforceable');
  });
});

describe('ESLint results for a file that does not parse', () => {
  it('notes the file once and keeps the findings of the other files', () => {
    const broken = path.join(root, 'src/strings.js');
    writeFileSync(broken, '{\n  "HELLO": "Hello",\n  "BYE": "Bye"\n}\n');
    const findings = normalizeEslintResults({
      value: [
        {
          filePath: broken,
          messages: [
            {
              ruleId: null,
              fatal: true,
              severity: 2,
              message: 'Parsing error: Unexpected token :',
              line: 2,
              column: 10,
            },
          ],
        },
        {
          filePath: file,
          messages: [
            {
              ruleId: 'no-constant-binary-expression',
              severity: 2,
              message: 'x',
              line: 1,
              column: 1,
            },
          ],
        },
      ],
      projectRoot: root,
      analyzerName: 'eslint-lint',
    });

    expect(
      findings.map(({ rule, path: where, classification }) => [rule, where, classification]),
    ).toEqual([
      ['unparsed-file', 'src/strings.js', 'descriptive'],
      ['no-constant-binary-expression', 'src/a.ts', 'enforceable'],
    ]);
    expect(findings[0]).toEqual({
      tool: 'eslint-lint',
      rule: 'unparsed-file',
      path: 'src/strings.js',
      classification: 'descriptive',
      identity: 'unparsed-file|occurrence:1',
      location: { line: 2, column: 10 },
      message:
        'eslint-lint could not parse src/strings.js (Parsing error: Unexpected token :), ' +
        'so it did not lint this file; the other files were linted.',
    });
  });

  it('keeps the rule messages that come with a fatal one', () => {
    const findings = normalizeEslintResults({
      value: [
        {
          filePath: file,
          messages: [
            { fatal: true, severity: 2, message: 'Unexpected token', line: 1, column: 1 },
            { ruleId: 'no-debugger', severity: 2, message: 'x', line: 1, column: 1 },
          ],
        },
      ],
      projectRoot: root,
      analyzerName: 'oxlint',
    });

    expect(findings.map(({ rule }) => rule)).toEqual(['unparsed-file', 'no-debugger']);
  });

  it('still fails on a file the TypeScript project does not include', () => {
    const notIncluded =
      'Parsing error: ESLint was configured to run on `src/a.ts` using `parserOptions.project`. ' +
      'However, that TSConfig does not include this file.';

    expect(() =>
      normalizeEslintResults({
        value: [
          {
            filePath: file,
            messages: [{ fatal: true, severity: 2, message: notIncluded, line: 1, column: 1 }],
          },
        ],
        projectRoot: root,
        analyzerName: 'eslint-lint',
      }),
    ).toThrow('ESLint result 0 is fatal: Parsing error: ESLint was configured');
  });
});
