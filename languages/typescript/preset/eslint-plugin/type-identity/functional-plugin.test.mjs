import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ESLint } from 'eslint';
import ts from 'typescript';
import tseslint from 'typescript-eslint';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { functionalPlugin } from './functional-plugin.mjs';

const fixtures = {
  'a-nested.ts':
    'export function rows(grid: readonly (readonly string[])[]): number { return grid.length; }\n',
  'b-plain.ts': 'export function names(list: readonly string[]): number { return list.length; }\n',
  'c-alias.ts':
    'export function rowsAlias(grid: ReadonlyArray<ReadonlyArray<string>>): number { return grid.length; }\n',
  'd-map.ts':
    'export function lookup(m: ReadonlyMap<string, ReadonlyMap<string, readonly string[]>>): number ' +
    '{ return m.size; }\n',
  'e-inner-mutable.ts':
    'export function bad(grid: readonly (string[])[]): number { return grid.length; }\n',
  'f-plain-mutable.ts': 'export function worse(list: string[]): number { return list.length; }\n',
  'g-recursive.ts':
    'export interface Tree<T> { readonly kids: readonly Tree<readonly T[]>[] }\n' +
    'export function size(tree: Tree<string>): number { return tree.kids.length; }\n',
  'h-mutable-tree.ts':
    'import type { Tree } from "./g-recursive";\n' +
    'export function heights(tree: Tree<string[]>): number { return tree.kids.length; }\n',
};

function parameterBelowReadonlyDeep(actual) {
  return [
    `Parameter should have an immutability of at least "ReadonlyDeep" (actual: "${actual}").`,
  ];
}

const expectedFindings = {
  'a-nested.ts': [],
  'b-plain.ts': [],
  'c-alias.ts': [],
  'd-map.ts': [],
  'e-inner-mutable.ts': parameterBelowReadonlyDeep('ReadonlyShallow'),
  'f-plain-mutable.ts': parameterBelowReadonlyDeep('Mutable'),
  'g-recursive.ts': [],
  'h-mutable-tree.ts': parameterBelowReadonlyDeep('ReadonlyShallow'),
};

const root = mkdtempSync(path.join(os.tmpdir(), 'nitpicker-immutable-identity-'));
const directory = path.join(root, 'src/main/features/grids/domain');
mkdirSync(directory, { recursive: true });
for (const [name, code] of Object.entries(fixtures)) {
  writeFileSync(path.join(directory, name), code);
}

const compilerOptions = {
  strict: true,
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  lib: ['lib.es2022.d.ts'],
  types: [],
  noEmit: true,
};
const libraryFiles = new Map();

function compilerHostSharingLibraryFiles() {
  const host = ts.createCompilerHost(compilerOptions);
  const readSourceFile = host.getSourceFile.bind(host);
  host.getSourceFile = (fileName, ...rest) => {
    if (fileName.startsWith(root)) {
      return readSourceFile(fileName, ...rest);
    }
    if (!libraryFiles.has(fileName)) {
      libraryFiles.set(fileName, readSourceFile(fileName, ...rest));
    }
    return libraryFiles.get(fileName);
  };
  return host;
}

function freshProgram() {
  return ts.createProgram(
    Object.keys(fixtures).map((name) => path.join(directory, name)),
    compilerOptions,
    compilerHostSharingLibraryFiles(),
  );
}

function createLinter(program) {
  return new ESLint({
    cwd: root,
    overrideConfigFile: true,
    overrideConfig: [
      {
        files: ['**/*.ts'],
        languageOptions: { parser: tseslint.parser, parserOptions: { programs: [program] } },
        plugins: { functional: functionalPlugin },
        rules: { 'functional/prefer-immutable-types': ['error', { enforcement: 'ReadonlyDeep' }] },
      },
    ],
  });
}

async function lintInOrder(names) {
  const eslint = createLinter(freshProgram());
  const found = {};
  for (const name of names) {
    const [result] = await eslint.lintFiles([path.join(directory, name)]);
    found[name] = result.messages.map((message) => message.message);
  }
  return found;
}

const orders = {
  forward: Object.keys(fixtures),
  reversed: Object.keys(fixtures).toReversed(),
};

const linted = {};

beforeAll(async () => {
  vi.stubEnv('NODE_ENV', 'production');
  try {
    for (const [order, names] of Object.entries(orders)) {
      linted[order] = await lintInOrder(names);
    }
  } finally {
    vi.unstubAllEnvs();
  }
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('prefer-immutable-types with nested readonly types and the process-wide type cache', () => {
  it.each(Object.keys(orders))(
    'reports exactly the mutable parameters when a fresh program lints the files %s',
    (order) => {
      expect(linted[order]).toEqual(expectedFindings);
    },
  );
});
