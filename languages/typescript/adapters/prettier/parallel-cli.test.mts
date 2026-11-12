import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { toolBinaryPath } from '../static-checks/shared.mts';
import { exclusionIgnoreLines, listUnformattedInParallel } from './parallel-cli.mts';

const toolPath = toolBinaryPath('prettier', { bin: 'bin/prettier.cjs' });
const temporaryRoots: string[] = [];
const UNFORMATTED = 'export const value = {a:1}\n';
const patterns = ['src/**/*.{ts,mjs,json}', 'tests/**/*.ts', '*.{ts,json}'];

afterAll(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function project(files: Readonly<Record<string, string>>): string {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-prettier-parallel-'));
  temporaryRoots.push(root);
  for (const [relativePath, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, relativePath)), { recursive: true });
    writeFileSync(path.join(root, relativePath), content);
  }
  return root;
}

function policyProject(files: Readonly<Record<string, string>>): string {
  return project({
    '.nitpicker-diff-prettier.json': '{"singleQuote": true}\n',
    '.nitpicker-diff-prettierignore': '.nitpicker-*\n/src/ignored/\n',
    ...files,
  });
}

function listInParallel(projectRoot: string, exclusions: readonly string[]): string[] | undefined {
  return listUnformattedInParallel({
    toolPath,
    projectRoot,
    configPath: path.join(projectRoot, '.nitpicker-diff-prettier.json'),
    ignorePath: path.join(projectRoot, '.nitpicker-diff-prettierignore'),
    patterns,
    exclusions,
  });
}

const projectFiles = {
  'src/main/live.ts': UNFORMATTED,
  'src/main/formatted.ts': "export const value = { a: 'b' };\n",
  'src/main/double.ts': 'export const value = "b";\n',
  'src/legacy/old.ts': UNFORMATTED,
  'src/legacy/deep/older.ts': UNFORMATTED,
  'src/generated/types.ts': UNFORMATTED,
  'src/ignored/skipped.ts': UNFORMATTED,
  'src/data.json': '{"a":1}\n',
  'src/.hidden/dot.ts': UNFORMATTED,
  'src/main/nested/.prettierrc': '{"semi": false}\n',
  'src/main/nested/semi.ts': UNFORMATTED,
  'tests/unit.test.ts': UNFORMATTED,
  'tests/legacy/old.test.ts': UNFORMATTED,
  'root.ts': UNFORMATTED,
  'node_modules/dependency/index.ts': UNFORMATTED,
  '.editorconfig': 'root = true\n[*]\nindent_style = tab\n',
  '.gitignore': 'src/main/\n',
};

const ALL_UNFORMATTED = [
  'root.ts',
  'src/.hidden/dot.ts',
  'src/data.json',
  'src/generated/types.ts',
  'src/legacy/deep/older.ts',
  'src/legacy/old.ts',
  'src/main/double.ts',
  'src/main/live.ts',
  'src/main/nested/semi.ts',
  'tests/legacy/old.test.ts',
  'tests/unit.test.ts',
];

describe('Prettier parallel CLI listing', () => {
  it.each([
    [[], []],
    [
      ['src/legacy/**', 'tests/legacy/**'],
      ['src/legacy/deep/older.ts', 'src/legacy/old.ts', 'tests/legacy/old.test.ts'],
    ],
    [
      ['src/legacy', 'src/generated/types.ts'],
      ['src/generated/types.ts', 'src/legacy/deep/older.ts', 'src/legacy/old.ts'],
    ],
    [
      ['src/.hidden/**', 'src/legacy/deep', 'root.ts', 'src/missing/**'],
      ['root.ts', 'src/.hidden/dot.ts', 'src/legacy/deep/older.ts'],
    ],
  ])(
    'with exclusions %j leaves out what the classic CLI leaves out: %j',
    (exclusions, excluded) => {
      const projectRoot = policyProject(projectFiles);

      expect(listInParallel(projectRoot, exclusions)?.toSorted()).toEqual(
        ALL_UNFORMATTED.filter((file) => !excluded.includes(file)),
      );
      expect(readdirSync(projectRoot).filter((name) => name.includes('exclude'))).toEqual([]);
      expect(existsSync(path.join(projectRoot, 'node_modules/.cache'))).toBe(false);
    },
  );

  it('reports a clean project as an empty list', () => {
    const projectRoot = policyProject({ 'src/main/formatted.ts': 'export const value = 1;\n' });

    expect(listInParallel(projectRoot, ['src/legacy/**'])).toEqual([]);
  });

  it('leaves a file Prettier cannot parse to the classic CLI', () => {
    const projectRoot = policyProject({
      'src/main/live.ts': UNFORMATTED,
      'src/main/broken.ts': 'export const = ;\n',
    });

    expect(listInParallel(projectRoot, [])).toBeUndefined();
  });

  it('leaves the run to the classic CLI and keeps a leftover exclusion file', () => {
    const projectRoot = policyProject({ '.nitpicker-diff-prettier-exclude': '/src/main/**\n' });

    expect(listInParallel(projectRoot, ['src/legacy/**'])).toBeUndefined();
    expect(readFileSync(path.join(projectRoot, '.nitpicker-diff-prettier-exclude'), 'utf8')).toBe(
      '/src/main/**\n',
    );
  });
});

describe('exclusionIgnoreLines', () => {
  function linesFor(exclusions: readonly string[]): string[] | undefined {
    return exclusionIgnoreLines(exclusions, { projectRoot: policyProject(projectFiles), patterns });
  }

  it('anchors exclusions made of literal folder or file names, with an optional globstar', () => {
    expect(linesFor(['src/legacy/**', 'src/legacy', 'src/.hidden/**', 'root.ts'])).toEqual([
      '/src/legacy/**',
      '/src/legacy',
      '/src/.hidden/**',
      '/root.ts',
    ]);
  });

  it.each([
    ['**/*.gen.ts'],
    ['**/legacy/**'],
    ['src/*/deep/**'],
    ['src/legacy*'],
    ['src/***/old.ts'],
    ['src/{a,b}/**'],
    ['src/[ab]/**'],
    ['src/@(a|b)/**'],
    ['src/a|b/**'],
    ['src/legacy/'],
    ['./src/**'],
    ['../src/**'],
    ['/src/**'],
    ['src\\legacy/**'],
    ['src/legacy /**'],
    ['**'],
    [''],
  ])('keeps %j on the classic CLI, whose glob semantics an ignore file cannot express', (glob) => {
    expect(linesFor(['src/legacy/**', glob])).toBeUndefined();
  });

  it.each([['src'], ['src/**'], ['tests']])(
    'keeps %j on the classic CLI, which never excludes the folder a pattern starts from',
    (glob) => {
      expect(linesFor([glob])).toBeUndefined();
    },
  );

  it.each([['src/Legacy/**'], ['SRC/legacy'], ['Root.ts']])(
    'keeps %j on the classic CLI, which matches case-sensitively where an ignore file does not',
    (glob) => {
      expect(linesFor([glob])).toBeUndefined();
    },
  );
});
