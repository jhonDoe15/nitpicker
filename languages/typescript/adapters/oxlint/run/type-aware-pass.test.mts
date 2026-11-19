import { spawn } from 'node:child_process';
import { rmSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { LintResult } from '../plan/oxlint-shapes.mts';
import { createProject, lintProject } from '../test-support/oxlint-project.mts';
import { sliceCount } from './stage-lint.mts';

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return { ...actual, spawn: vi.fn(actual.spawn) };
});

const POLICY = `import tseslint from ${JSON.stringify(import.meta.resolve('typescript-eslint'))};

export default [
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { project: './tsconfig.json', tsconfigRootDir: import.meta.dirname },
    },
    plugins: { '@typescript-eslint': tseslint.plugin },
    rules: {
      '@typescript-eslint/no-unnecessary-type-assertion': 'error',
      'no-debugger': 'error',
    },
  },
  {
    files: ['src/react/**/*.ts'],
    settings: { react: { version: '19.0.0' } },
  },
];
`;
const TYPED_RULE = '@typescript-eslint/no-unnecessary-type-assertion';
const MIXED = [
  'declare const sure: string;',
  `// eslint-disable-next-line ${TYPED_RULE}`,
  'export const quiet = sure as string;',
  '// eslint-disable-next-line no-debugger',
  'debugger;',
  '// eslint-disable-next-line no-debugger',
  'export const loud = sure as string;',
  `// eslint-disable-next-line ${TYPED_RULE}`,
  'debugger;',
  '',
].join('\n');
const EXPECTED = [
  { ruleId: undefined, line: 6 },
  { ruleId: TYPED_RULE, line: 7 },
  { ruleId: undefined, line: 8 },
  { ruleId: 'no-debugger', line: 9 },
];

let root: string;
let results: readonly LintResult[];
let typeAwareRuns: number;

function messagesOf(relativePath: string) {
  const result = results.find((entry) => entry.filePath === path.join(root, relativePath));
  return (result?.messages ?? []).map(({ ruleId, line }) => ({ ruleId, line }));
}

beforeAll(async () => {
  root = createProject('nitpicker-oxlint-passes-', {
    'policy.mjs': POLICY,
    'tsconfig.nitpicker.json': JSON.stringify({
      compilerOptions: { strict: true, skipLibCheck: true, types: [], lib: ['ES2022'] },
      include: ['src/**/*.ts'],
    }),
    'src/mixed.ts': MIXED,
    'src/react/mixed.ts': MIXED,
  });
  vi.mocked(spawn).mockClear();
  results = await lintProject({
    root,
    patterns: ['src/**/*.ts'],
    projectConfigName: 'tsconfig.nitpicker.json',
  });
  typeAwareRuns = vi
    .mocked(spawn)
    .mock.calls.filter(([, args]) => args.includes('--type-aware')).length;
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('the type-aware rules of eslint-lint', () => {
  it('run once over every file, whatever settings the files have', () => {
    expect(typeAwareRuns).toBe(1);
  });

  it('keep the findings and report a directive as unused only when no pass used it', () => {
    expect(messagesOf('src/mixed.ts')).toEqual(EXPECTED);
    expect(messagesOf('src/react/mixed.ts')).toEqual(EXPECTED);
  });
});

describe('the slices of the plugin pass', () => {
  it('take one CPU each, as far as memory and the file count allow', () => {
    const gib = 1024 ** 3;

    expect(sliceCount(10_000, 4, 15 * gib)).toBe(4);
    expect(sliceCount(10_000, 16, 4 * gib)).toBe(2);
    expect(sliceCount(300, 16, 64 * gib)).toBe(1);
  });
});
