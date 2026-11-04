import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { PACKAGE_ROOT } from '../../../../core/tooling/tool-resolution.mjs';
import {
  mutationCheckerEngine,
  mutationTypecheck,
  nativeCheckerRuntime,
  withNativeChecker,
} from './native-checker.mjs';

const roots = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function project(source, compilerOptions = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-native-checker-'));
  roots.push(root);
  const files = {
    'tsconfig.json': JSON.stringify({
      compilerOptions: { strict: true, types: [], lib: ['ES2022'], ...compilerOptions },
      include: ['src'],
    }),
    'src/main.ts': source,
  };
  for (const [name, content] of Object.entries(files)) {
    const file = path.join(root, name);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, content);
  }
  return root;
}

function typecheck(root, engine = 'native') {
  return mutationTypecheck({
    options: { projectRoot: root, liveProjectRoot: PACKAGE_ROOT },
    tsconfigPath: path.join(root, 'tsconfig.json'),
    engine,
  });
}

describe('native mutation checker selection', () => {
  it('uses the TypeScript 7 checker only with the native engine on Node.js', () => {
    expect(nativeCheckerRuntime('native', { node: '22.23.0' })).toBe(true);
    expect(nativeCheckerRuntime('project', { node: '22.23.0' })).toBe(false);
    expect(nativeCheckerRuntime('native', { node: '24.0.0', deno: '2.5.0' })).toBe(false);
    expect(nativeCheckerRuntime('native', { node: '24.0.0', bun: '1.4.4' })).toBe(false);
  });

  it('keeps the grouping TypeScript 6 checker for full runs, which can hold thousands of mutants', () => {
    expect(mutationCheckerEngine(['src/a.ts:1-4'], 'native')).toBe('native');
    expect(mutationCheckerEngine([], 'native')).toBe('native');
    expect(mutationCheckerEngine(undefined, 'native')).toBe('project');
    expect(mutationCheckerEngine(['src/a.ts:1-4'], 'project')).toBe('project');
  });

  it('type checks the mutation config with TypeScript 7', async () => {
    await expect(typecheck(project('export const one: number = 1;\n'))).resolves.toEqual({
      clean: true,
      native: true,
    });
    await expect(typecheck(project("export const one: number = 'one';\n"))).resolves.toEqual({
      clean: false,
      native: true,
    });
  });

  it('falls back to the TypeScript 6 checker where the type check falls back', async () => {
    const removedOption = project('export const one: number = 1;\n', {
      module: 'commonjs',
      moduleResolution: 'node10',
    });
    expect((await typecheck(removedOption)).native).toBe(false);
    await expect(typecheck(project('export const one = 1;\n'), 'project')).resolves.toEqual({
      clean: true,
      native: false,
    });
  });

  it('switches on the native preview without dropping other checker options', () => {
    expect(
      withNativeChecker({
        checkers: ['typescript'],
        typescriptChecker: { prioritizePerformanceOverAccuracy: false },
      }),
    ).toEqual({
      checkers: ['typescript'],
      typescriptChecker: {
        prioritizePerformanceOverAccuracy: false,
        experimentalNativePreview: true,
      },
    });
  });
});
