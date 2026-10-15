import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ESLint } from 'eslint';
import tseslint from 'typescript-eslint';
import { afterAll, describe, expect, it } from 'vitest';
import { functionalPlugin } from './functional-plugin.mjs';

const fixtures = {
  'a-nested.ts':
    'export function rows(grid: readonly (readonly string[])[]): number { return grid.length; }\n',
  'b-plain.ts': 'export function names(list: readonly string[]): number { return list.length; }\n',
  'c-alias.ts':
    'export function rowsAlias(grid: ReadonlyArray<ReadonlyArray<string>>): number { return grid.length; }\n',
  'd-map.ts':
    'export function lookup(m: ReadonlyMap<string, ReadonlyMap<string, readonly string[]>>): number { return m.size; }\n',
  'e-inner-mutable.ts':
    'export function bad(grid: readonly (string[])[]): number { return grid.length; }\n',
  'f-plain-mutable.ts': 'export function worse(list: string[]): number { return list.length; }\n',
  'g-recursive.ts':
    'export interface Tree<T> { readonly kids: readonly Tree<readonly T[]>[] }\nexport function size(tree: Tree<string>): number { return tree.kids.length; }\n',
};

const root = mkdtempSync(path.join(os.tmpdir(), 'nitpicker-immutable-identity-'));
const directory = path.join(root, 'src/main/features/grids/domain');
mkdirSync(directory, { recursive: true });
for (const [name, code] of Object.entries(fixtures)) {
  writeFileSync(path.join(directory, name), code);
}
writeFileSync(
  path.join(root, 'tsconfig.json'),
  JSON.stringify({
    compilerOptions: { strict: true, target: 'ES2022', module: 'ESNext', lib: ['ES2022'] },
    include: ['src/**/*'],
  }),
);

const eslint = new ESLint({
  cwd: root,
  overrideConfigFile: true,
  overrideConfig: [
    {
      files: ['**/*.ts'],
      languageOptions: {
        parser: tseslint.parser,
        parserOptions: { project: './tsconfig.json', tsconfigRootDir: root },
      },
      plugins: { functional: functionalPlugin },
      rules: { 'functional/prefer-immutable-types': ['error', { enforcement: 'ReadonlyDeep' }] },
    },
  ],
});

async function mutableParameters() {
  const results = await eslint.lintFiles([path.join(directory, '*.ts')]);
  return Object.fromEntries(
    results.map((result) => [
      path.basename(result.filePath),
      result.messages.map((message) => message.message),
    ]),
  );
}

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('prefer-immutable-types with a nested readonly type', () => {
  it('accepts deeply readonly nested arrays and maps in any file order', async () => {
    const found = await mutableParameters();
    expect(found['a-nested.ts']).toEqual([]);
    expect(found['b-plain.ts']).toEqual([]);
    expect(found['c-alias.ts']).toEqual([]);
    expect(found['d-map.ts']).toEqual([]);
  });

  it('still reports a mutable inner or outer array', async () => {
    const found = await mutableParameters();
    expect(found['e-inner-mutable.ts']).toHaveLength(1);
    expect(found['f-plain-mutable.ts']).toHaveLength(1);
  });

  it('terminates on a generic type that expands without end', async () => {
    const found = await mutableParameters();
    expect(found['g-recursive.ts']).toEqual([]);
  });
});
