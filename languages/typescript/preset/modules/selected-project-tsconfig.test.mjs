import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { afterAll, describe, expect, it } from 'vitest';
import { resolveLayoutFor } from '../layout.mjs';
import { layoutTransformFor } from '../tool-configs.mjs';
import {
  readDefault,
  removeTemporaryRoots,
  temporaryProject,
} from '../layout/test-support/layout-config-helpers.mjs';

afterAll(removeTemporaryRoots);

describe('explicit TypeScript project config', () => {
  it.each(['tsconfig.quality.json', 'tsconfig.stryker.json'])(
    '%s follows nested inherited project options and scope without extra strictness',
    (name) => {
      const root = temporaryProject({});
      mkdirSync(path.join(root, 'config'));
      mkdirSync(path.join(root, 'src'));
      mkdirSync(path.join(root, 'tests'));
      writeFileSync(
        path.join(root, 'config/base.json'),
        JSON.stringify({
          compilerOptions: {
            strict: true,
            target: 'ES2022',
            module: 'ESNext',
            moduleResolution: 'Bundler',
            types: [],
            lib: ['ES2022'],
          },
          include: ['../src/**/*.ts'],
          exclude: ['../src/project-excluded.ts'],
        }),
      );
      writeFileSync(path.join(root, 'config/types.json'), '{"extends":"./base.json"}');
      writeFileSync(
        path.join(root, 'src/email.ts'),
        "export const domainOf = (email: string): string => email.split('@')[1];",
      );
      for (const file of [
        'src/project-excluded.ts',
        'src/nitpicker-excluded.ts',
        'tests/out-of-scope.ts',
      ]) {
        writeFileSync(path.join(root, file), 'export const invalid: string = 1;');
      }
      const layout = resolveLayoutFor({
        tools: { typescript: { project: 'config/types.json' } },
        exclude: ['src/nitpicker-excluded.ts'],
      });
      const target = path.join(root, '.nitpicker-config.json');
      writeFileSync(
        target,
        layoutTransformFor(name, layout)(JSON.stringify(readDefault(name)), target),
      );
      const parsed = ts.getParsedCommandLineOfConfigFile(
        target,
        {},
        {
          ...ts.sys,
          onUnRecoverableConfigFileDiagnostic: () => undefined,
        },
      );
      expect(parsed.errors).toEqual([]);
      expect(parsed.fileNames).toEqual([path.join(root, 'src/email.ts')]);
      expect(parsed.options.strict).toBe(true);
      expect(parsed.options.noUncheckedIndexedAccess).toBeUndefined();
      expect(parsed.options.allowJs).toBeUndefined();
      expect(parsed.options.noEmit).toBe(true);
      expect(ts.getPreEmitDiagnostics(ts.createProgram(parsed.fileNames, parsed.options))).toEqual(
        [],
      );
      writeFileSync(path.join(root, 'src/email.ts'), 'export const invalid: string = 1;');
      expect(
        ts
          .getPreEmitDiagnostics(ts.createProgram(parsed.fileNames, parsed.options))
          .map(({ code }) => code),
      ).toEqual([2322]);
    },
  );
  it('fails for a missing selected config instead of using the preset', () => {
    const root = temporaryProject({});
    const layout = resolveLayoutFor({ tools: { typescript: { project: 'missing.json' } } });
    expect(() =>
      layoutTransformFor('tsconfig.quality.json', layout)(
        '{}',
        path.join(root, '.nitpicker-config.json'),
      ),
    ).toThrow('missing.json');
  });
  it('rejects a config symlink outside the project', () => {
    const outside = temporaryProject({ 'types.json': '{}' });
    const root = temporaryProject({});
    symlinkSync(path.join(outside, 'types.json'), path.join(root, 'types.json'));
    const layout = resolveLayoutFor({ tools: { typescript: { project: 'types.json' } } });
    expect(() =>
      layoutTransformFor('tsconfig.stryker.json', layout)(
        '{}',
        path.join(root, '.nitpicker-config.json'),
      ),
    ).toThrow('inside the project');
  });
  it('preserves default output exclusions and rebases project references', () => {
    const root = temporaryProject({});
    mkdirSync(path.join(root, 'config'));
    writeFileSync(
      path.join(root, 'config/types.json'),
      JSON.stringify({
        compilerOptions: { outDir: '../output', types: [], lib: ['ES2022'] },
        files: [],
        references: [{ path: '../app', prepend: false }],
      }),
    );
    const layout = resolveLayoutFor({
      tools: { typescript: { project: 'config/types.json' } },
      exclude: ['legacy/**'],
    });
    const config = JSON.parse(
      layoutTransformFor('tsconfig.quality.json', layout)(
        '{}',
        path.join(root, '.nitpicker-config.json'),
      ),
    );
    expect(config.exclude).toEqual([
      'config/node_modules',
      'config/bower_components',
      'config/jspm_packages',
      'output',
      'legacy/**',
    ]);
    expect(config.references).toEqual([{ path: 'app', prepend: false }]);
  });
});
