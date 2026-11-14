import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll } from 'vitest';
import { IO_PACKAGES } from './io-packages.mjs';
import { typescriptRuleTester } from './rule-tester.mjs';

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

export function typedIoProject(prefix, store, files = {}) {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), `nitpicker-${prefix}-`)));
  for (const [name, declarations] of Object.entries(IO_PACKAGES)) {
    const folder = path.join(root, 'node_modules', name);
    mkdirSync(folder, { recursive: true });
    writeFileSync(path.join(folder, 'index.d.ts'), `${declarations}\n`);
    writeFileSync(
      path.join(folder, 'package.json'),
      JSON.stringify({ name, version: '1.0.0', types: 'index.d.ts' }),
    );
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
  const written = [];
  function typedFile(code, extension) {
    written.push(code);
    const filename = path.resolve(root, 'src', `case-${String(written.length)}.${extension}`);
    if (!filename.startsWith(`${root}${path.sep}`)) {
      return { code };
    }
    writeFileSync(filename, code);
    return { filename, code };
  }
  function typed(code) {
    return typedFile(code, 'ts');
  }
  function typedScript(code) {
    return typedFile(code, 'js');
  }
  return {
    tester: typescriptRuleTester({ project: './tsconfig.json', tsconfigRootDir: root }),
    typed,
    typedScript,
    typedFile,
  };
}
