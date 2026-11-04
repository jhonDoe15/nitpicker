import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { resolveTool } from '../../../../core/tooling/tool-resolution.mjs';
import { exclusionIgnoreLines, listUnformattedInParallel } from './parallel-cli.mjs';

const toolPath = resolveTool('prettier', { bin: 'bin/prettier.cjs' }).binPath;
const temporaryRoots = [];
const UNFORMATTED = 'export const value = {a:1}\n';
const patterns = ['src/**/*.{ts,mjs,json}', 'tests/**/*.ts', '*.{ts,json}'];

afterAll(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function project(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-prettier-parallel-'));
  temporaryRoots.push(root);
  for (const [relativePath, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, relativePath)), { recursive: true });
    writeFileSync(path.join(root, relativePath), content);
  }
  return root;
}

function policyProject(files) {
  return project({
    '.nitpicker-diff-prettier.json': '{"singleQuote": true}\n',
    '.nitpicker-diff-prettierignore': '.nitpicker-*\n/src/ignored/\n',
    ...files,
  });
}

function listInParallel(projectRoot, exclusions) {
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
      ['**/legacy/**', 'src/.hidden/**'],
      [
        'src/.hidden/dot.ts',
        'src/legacy/deep/older.ts',
        'src/legacy/old.ts',
        'tests/legacy/old.test.ts',
      ],
    ],
    [
      ['src/*/deep/**', 'root.ts'],
      ['root.ts', 'src/legacy/deep/older.ts'],
    ],
    [['**'], ALL_UNFORMATTED],
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

  it('refuses to overwrite a leftover exclusion file', () => {
    const projectRoot = policyProject({ '.nitpicker-diff-prettier-exclude': '/src/main/**\n' });

    expect(() => listInParallel(projectRoot, ['src/legacy/**'])).toThrow(/EEXIST/u);
  });
});

describe('exclusionIgnoreLines', () => {
  it('anchors exclusions whose last segment is a folder name, a file name or a globstar', () => {
    expect(exclusionIgnoreLines(['src/legacy/**', 'src/legacy', '**/fixtures/**', 'a.ts'])).toEqual(
      ['/src/legacy/**', '/src/legacy', '/**/fixtures/**', '/a.ts'],
    );
  });

  it.each([
    ['**/*.gen.ts'],
    ['src/legacy*'],
    ['src/{a,b}/**'],
    ['src/[ab]/**'],
    ['src/@(a|b)/**'],
    ['src/legacy/'],
    ['./src/**'],
    ['../src/**'],
    ['/src/**'],
    ['src\\legacy/**'],
    ['src/legacy /**'],
    [''],
  ])('keeps %j on the classic CLI, whose glob semantics an ignore file cannot express', (glob) => {
    expect(exclusionIgnoreLines(['src/legacy/**', glob])).toBeUndefined();
  });
});
