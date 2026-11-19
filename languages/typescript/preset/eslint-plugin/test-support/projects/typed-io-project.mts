import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll } from 'vitest';
import { IO_PACKAGES } from './io-packages.mts';
import { typescriptRuleTester, type TypedRuleTester } from '../rule-tester.mts';

type TypedCase = { filename?: string; code: string };

type TypedIoProject = {
  tester: TypedRuleTester;
  typed: (code: string) => TypedCase;
  typedScript: (code: string) => TypedCase;
  typedFile: (code: string, extension: string) => TypedCase;
};

const COMPILER_OPTIONS = {
  strict: true,
  module: 'esnext',
  moduleResolution: 'bundler',
  noEmit: true,
  types: [],
  lib: ['ES2022', 'DOM'],
  experimentalDecorators: true,
  allowJs: true,
  checkJs: true,
};

function writePackage(
  root: string,
  { name, declarations }: { readonly name: string; readonly declarations: string },
): void {
  const manifest = JSON.stringify({ name, version: '1.0.0', types: 'index.d.ts' });
  const packageFiles: readonly (readonly [string, string])[] = [
    ['index.d.ts', `${declarations}\n`],
    ['package.json', manifest],
  ];
  for (const [file, content] of packageFiles) {
    const target = path.resolve(root, 'node_modules', name, file);
    if (!target.startsWith(`${root}${path.sep}`)) {
      continue;
    }
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, content);
  }
}

export function typedIoProject(
  prefix: string,
  store: string,
  files: Record<string, string> = {},
  packages: Record<string, string> = IO_PACKAGES,
): TypedIoProject {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), `nitpicker-${prefix}-`)));
  for (const [name, declarations] of Object.entries(packages)) {
    writePackage(root, { name, declarations });
  }
  writeFileSync(
    path.join(root, 'tsconfig.json'),
    JSON.stringify({ compilerOptions: COMPILER_OPTIONS, include: ['src'] }),
  );
  mkdirSync(path.join(root, 'src'));
  for (const [name, content] of Object.entries({ 'store.ts': store, ...files })) {
    const filename = path.resolve(root, 'src', name);
    if (filename.startsWith(`${root}${path.sep}`)) {
      mkdirSync(path.dirname(filename), { recursive: true });
      writeFileSync(filename, `${content}\n`);
    }
  }
  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });
  const written: string[] = [];
  function typedFile(code: string, extension: string): TypedCase {
    written.push(code);
    const filename = path.resolve(root, 'src', `case-${String(written.length)}.${extension}`);
    if (!filename.startsWith(`${root}${path.sep}`)) {
      return { code };
    }
    writeFileSync(filename, code);
    return { filename, code };
  }
  function typed(code: string) {
    return typedFile(code, 'ts');
  }
  function typedScript(code: string) {
    return typedFile(code, 'js');
  }
  return {
    tester: typescriptRuleTester({
      project: './tsconfig.json',
      tsconfigRootDir: root,
      disallowAutomaticSingleRunInference: true,
    }),
    typed,
    typedScript,
    typedFile,
  };
}
