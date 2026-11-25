import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type TypeScript from 'typescript';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PACKAGE_ROOT } from '../../../../../core/tooling/tool-resolution.mts';
import { loadTypeScript, preEmitDiagnostics } from '../typescript-program.mts';
import { typescript7Overrides, withTypescript7Options } from './typescript7-config.mts';

const LEGACY = {
  strict: true,
  noEmit: true,
  skipLibCheck: true,
  types: [],
  lib: ['ES2022'],
  module: 'commonjs',
  target: 'ES5',
  moduleResolution: 'node',
  esModuleInterop: false,
  baseUrl: 'src',
  paths: { '@app/*': ['app/*'] },
};

let root: string;

beforeAll(() => {
  root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-typescript7-')));
  mkdirSync(path.join(root, 'src/lib'), { recursive: true });
  mkdirSync(path.join(root, 'src/app'), { recursive: true });
  writeFileSync(path.join(root, 'src/lib/answer.ts'), 'export const answer: number = 1;\n');
  writeFileSync(path.join(root, 'src/app/name.ts'), "export const name = 'app';\n");
  writeFileSync(
    path.join(root, 'src/main.ts'),
    "import { answer } from 'lib/answer';\nimport { name } from '@app/name';\n\n" +
      'export const text: string = answer;\nexport const label: number = name;\n',
  );
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

function writeConfig(name: string, compilerOptions: Readonly<Record<string, unknown>>): string {
  const configPath = path.join(root, name);
  writeFileSync(configPath, JSON.stringify({ compilerOptions, include: ['src'] }));
  return configPath;
}

function withoutFallback(ts: typeof TypeScript): typeof TypeScript {
  return {
    ...ts,
    createProgram: () => {
      throw new Error('fell back to the JavaScript compiler');
    },
  };
}

describe('options TypeScript 7 removed', () => {
  it('maps baseUrl to paths and unsets the removed options, keeping the lowest target it knows', () => {
    const configPath = writeConfig('tsconfig.legacy.json', LEGACY);

    expect(typescript7Overrides(configPath)).toEqual({
      baseUrl: null,
      paths: { '@app/*': [`${root}/src/app/*`], '*': [`${root}/src/*`] },
      target: 'ES2015',
      moduleResolution: null,
      esModuleInterop: null,
    });
  });

  it('leaves configs alone that TypeScript 7 accepts or that it cannot express', () => {
    const modern = writeConfig('tsconfig.modern.json', { strict: true, module: 'esnext' });
    const amd = writeConfig('tsconfig.amd.json', { ...LEGACY, module: 'amd' });
    const outFile = writeConfig('tsconfig.out-file.json', { ...LEGACY, outFile: 'out.js' });

    expect([modern, amd, outFile].map((configPath) => typescript7Overrides(configPath))).toEqual([
      undefined,
      undefined,
      undefined,
    ]);
  });

  it('writes the mapped options only while the run lasts', async () => {
    const configPath = writeConfig('tsconfig.restored.json', LEGACY);
    const before = readFileSync(configPath, 'utf8');

    const seen = await withTypescript7Options(configPath, () =>
      Promise.resolve(readFileSync(configPath, 'utf8')),
    );

    expect(JSON.parse(seen).compilerOptions).toMatchObject({ baseUrl: null, target: 'ES2015' });
    expect(readFileSync(configPath, 'utf8')).toBe(before);
  });

  it('type checks such a project with TypeScript 7 instead of falling back', async () => {
    const configPath = writeConfig('tsconfig.native.json', LEGACY);
    const ts = loadTypeScript(PACKAGE_ROOT);

    const diagnostics = await preEmitDiagnostics({
      ts: withoutFallback(ts),
      engine: 'native',
      configPath,
      configName: undefined,
      projectRoot: root,
      projectNative: undefined,
    });

    expect(
      diagnostics.map(({ code, file, start }) => [
        code,
        file === undefined || start === undefined
          ? undefined
          : file.getLineAndCharacterOfPosition(start).line,
      ]),
    ).toEqual([
      [2322, 3],
      [2322, 4],
    ]);
  });
});
