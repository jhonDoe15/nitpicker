import { spawn } from 'node:child_process';
import { rmSync } from 'node:fs';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { LintResult } from '../plan/oxlint-shapes.mts';
import { TYPED_POLICY, createProject, lintProject } from '../test-support/oxlint-project.mts';
import { FILES_PER_PROGRAM_VARIABLE, programSlices } from './type-aware-programs.mts';
import { resolvesImports } from './global-declarations.mts';

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return { ...actual, spawn: vi.fn(actual.spawn) };
});

const RULE = '@typescript-eslint/no-unnecessary-type-assertion';
const USERS = ['src/answer.ts', 'src/banner.ts', 'src/shape.ts'];

let root: string;

function findingsOf(results: readonly LintResult[]): string[] {
  return results
    .flatMap(({ filePath, messages }) =>
      messages.map(
        ({ ruleId, line }) => `${path.relative(root, filePath)}:${String(line)} ${String(ruleId)}`,
      ),
    )
    .sort();
}

async function lintWith(filesPerProgram: string): Promise<{ findings: string[]; runs: number }> {
  vi.stubEnv(FILES_PER_PROGRAM_VARIABLE, filesPerProgram);
  vi.mocked(spawn).mockClear();
  const results = await lintProject({
    root,
    patterns: ['src/**/*.ts'],
    projectConfigName: 'tsconfig.nitpicker.json',
  });
  const runs = vi.mocked(spawn).mock.calls.filter(([, args]) => args.includes('--type-aware'));
  return { findings: findingsOf(results), runs: runs.length };
}

beforeAll(() => {
  root = createProject('nitpicker-oxlint-programs-', {
    'policy.mjs': TYPED_POLICY,
    'base.json': JSON.stringify({ include: ['**/*.ts'] }),
    'no-resolve-base.json': JSON.stringify({
      compilerOptions: { noResolve: true, types: [], lib: ['ES2022'] },
    }),
    'no-resolve.json': JSON.stringify({ extends: './no-resolve-base.json', include: ['src'] }),
    'stray/outside.ts': 'declare const outside: string;\n',
    'src/outside.ts': 'export const seen = outside as string;\n',
    'tsconfig.nitpicker.json': JSON.stringify({
      extends: './base.json',
      compilerOptions: { strict: true, skipLibCheck: true, types: [], lib: ['ES2022'] },
      include: ['src/**/*.ts'],
    }),
    'src/global-augment.ts': 'export {};\ndeclare global {\n  var answer: string;\n}\n',
    'src/globals.d.ts': 'declare const banner: string;\n',
    'src/model.ts': 'export interface Shape {\n  name: string;\n}\n',
    'src/model-augment.ts':
      "export {};\ndeclare module './model' {\n  interface Shape {\n    extra: string;\n  }\n}\n",
    'src/answer.ts': 'export const answer = globalThis.answer as string;\n',
    'src/banner.ts': 'export const shown = banner as string;\n',
    'src/shape.ts':
      "import type { Shape } from './model';\nexport const extra = (shape: Shape) => shape.extra as string;\n",
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('the type-aware pass of a large project', () => {
  it('splits the files into sorted runs of about the same size', () => {
    expect(programSlices(['e', 'a', 'd', 'b', 'c'], 2)).toEqual([['a', 'b'], ['c', 'd'], ['e']]);
    expect(programSlices(['b', 'a'], 5)).toEqual([['a', 'b']]);
  });

  it('keeps one program when the config turns off import resolution, even through extends', () => {
    expect(resolvesImports(path.join(root, 'tsconfig.nitpicker.json'))).toBe(true);
    expect(resolvesImports(path.join(root, 'no-resolve.json'))).toBe(false);
  });

  it('runs one smaller program per run and keeps every finding of the whole program', async () => {
    const whole = await lintWith('100');
    const split = await lintWith('1');

    expect(whole.runs).toBe(1);
    expect(whole.findings).toEqual(
      USERS.map((file) => `${file}:${file === 'src/shape.ts' ? '2' : '1'} ${RULE}`),
    );
    expect(split.runs).toBe(8);
    expect(split.findings).toEqual(whole.findings);
  });
});
