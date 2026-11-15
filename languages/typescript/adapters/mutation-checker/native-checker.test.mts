import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PACKAGE_ROOT } from '../../../../core/tooling/tool-resolution.mjs';
import { checkoutModulePath } from '../../../../shared/paths/checkout-module.mjs';
import {
  mutationCheckerConfig,
  mutationCheckerEngine,
  mutationTypecheck,
  nativeCheckerRuntime,
} from './native-checker.mts';
import { testOptions } from '../test-runners/typed/test-options.mts';
import { fieldsOf, parseJson } from '../../../../shared/values/readers.mts';
import { strictProjects } from './test-support/strict-project.mts';

const projects = strictProjects('nitpicker-native-checker-');

function project(
  source: string,
  compilerOptions: object = {},
  extra: Readonly<Record<string, string>> = {},
): string {
  return projects.create(source, compilerOptions, extra);
}

function typecheck(root: string, engine = 'native'): ReturnType<typeof mutationTypecheck> {
  return mutationTypecheck({
    options: testOptions({ projectRoot: root, liveProjectRoot: PACKAGE_ROOT }),
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

  it('probes without emitting, so JavaScript inputs do not count as overwritten outputs', async () => {
    const root = project(
      'export const one: number = 1;\n',
      { allowJs: true, checkJs: true },
      {
        'src/helper.js': 'export const two = 2;\n',
      },
    );
    await expect(typecheck(root)).resolves.toEqual({ clean: true, native: true });
    expect(readdirSync(root).sort()).toEqual(['src', 'tsconfig.json']);
  });

  it('keeps TypeScript 6 for configs with project references, which the native checker rejects', async () => {
    const root = project(
      'export const one: number = 1;\n',
      {},
      {
        'lib/tsconfig.json': JSON.stringify({
          compilerOptions: { composite: true, types: [], lib: ['ES2022'] },
          include: ['*.ts'],
        }),
        'lib/value.ts': 'export const value = 1;\n',
      },
    );
    const config = fieldsOf(parseJson(readFileSync(path.join(root, 'tsconfig.json'), 'utf8')));
    writeFileSync(
      path.join(root, 'tsconfig.json'),
      JSON.stringify({ ...config, references: [{ path: './lib' }] }),
    );
    expect((await typecheck(root)).native).toBe(false);
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

  const config = {
    checkers: ['typescript'],
    plugins: ['vitest-runner.js', 'typescript-checker.js'],
    typescriptChecker: { prioritizePerformanceOverAccuracy: false },
  };

  it('switches on the native preview without dropping other checker options', () => {
    expect(mutationCheckerConfig(config, { baselineErrors: false, native: true })).toEqual({
      ...config,
      typescriptChecker: {
        prioritizePerformanceOverAccuracy: false,
        experimentalNativePreview: true,
      },
    });
    expect(mutationCheckerConfig(config, { baselineErrors: false, native: false })).toBe(config);
  });

  it.each([true, false])(
    'keeps the baseline-aware checker for projects with type errors (native probe: %s)',
    (native) => {
      expect(mutationCheckerConfig(config, { baselineErrors: true, native })).toEqual({
        ...config,
        checkers: ['nitpicker-typescript'],
        plugins: [
          ...config.plugins,
          checkoutModulePath(path.join(import.meta.dirname, 'plugin.mjs')),
        ],
      });
    },
  );
});
