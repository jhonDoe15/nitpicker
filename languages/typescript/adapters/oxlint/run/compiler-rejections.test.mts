import { rmSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { LintResult } from '../plan/oxlint-shapes.mts';
import { createProject, lintProject } from '../test-support/oxlint-project.mts';
import { withRejectedFilesRelinted } from './compiler-rejections.mts';

const POLICY = `import tseslint from ${JSON.stringify(import.meta.resolve('typescript-eslint'))};

export default [
  {
    files: ['src/**/*.ts'],
    languageOptions: { parser: tseslint.parser },
    rules: { 'no-debugger': 'error' },
  },
];
`;

const SOURCES = {
  'src/abstract.ts': 'debugger;\nexport abstract class A { abstract m() {} }\n',
  'src/optional.ts': 'debugger;\nexport function f(a?: number, b: number) { return [a, b]; }\n',
  'src/plain.ts': 'debugger;\n',
};

let root: string;
let results: readonly LintResult[];

function summary(entries: readonly LintResult[]) {
  return entries.map(({ filePath, messages }) => [
    path.relative(root, filePath),
    messages.map(({ ruleId, fatal, message }) =>
      fatal === true ? message.slice(0, message.indexOf(':')) : ruleId,
    ),
  ]);
}

beforeAll(async () => {
  root = createProject('nitpicker-oxlint-compiler-', { 'policy.mjs': POLICY, ...SOURCES });
  results = await lintProject({ root, patterns: ['src/**/*.ts'] });
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('files oxlint rejects with a TypeScript error code', () => {
  it('marks only those files and keeps the findings of the others', () => {
    expect(summary(results)).toEqual([
      ['src/abstract.ts', ['TS(1245)']],
      ['src/optional.ts', ['TS(1016)']],
      ['src/plain.ts', ['no-debugger']],
    ]);
  });

  it('replaces the results of those files with the ones ESLint reports for them', async () => {
    const linted: string[][] = [];
    const relinted = await withRejectedFilesRelinted(results, {
      projectRoot: root,
      lintFiles(patterns) {
        linted.push([...patterns]);
        return Promise.resolve(
          patterns.map((file) => ({
            filePath: path.join(root, file),
            messages: [{ ruleId: 'no-debugger', message: 'x', severity: 2, line: 1, column: 1 }],
          })),
        );
      },
    });

    expect(linted).toEqual([['src/abstract.ts', 'src/optional.ts']]);
    expect(summary(relinted)).toEqual([
      ['src/abstract.ts', ['no-debugger']],
      ['src/optional.ts', ['no-debugger']],
      ['src/plain.ts', ['no-debugger']],
    ]);
  });

  it('runs no ESLint when oxlint rejected no file', async () => {
    const plain = results.filter(({ filePath }) => filePath.endsWith('plain.ts'));
    const relinted = await withRejectedFilesRelinted(plain, {
      projectRoot: root,
      lintFiles: () => Promise.reject(new Error('ESLint should not run')),
    });

    expect(relinted).toEqual(plain);
  });
});
