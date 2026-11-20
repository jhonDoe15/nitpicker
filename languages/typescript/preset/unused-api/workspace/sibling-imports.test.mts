import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resolveLayoutFor as untypedResolveLayoutFor } from '../../layout.mts';
import { createProjectProgram } from '../program.mts';
import { relevantSiblingFiles } from './sibling-imports.mts';
import { loadPackages } from '../analysis-views.mts';
import type { AnalysisLayout } from '../analysis-views.mts';
import type { ProgramLayout } from './workspace-types.mts';

const resolveLayoutFor: (policy: object) => ProgramLayout & AnalysisLayout =
  untypedResolveLayoutFor;
const PACKAGES = 200;
const CONFIG = {
  compilerOptions: {
    strict: true,
    module: 'esnext',
    moduleResolution: 'bundler',
    types: [],
    lib: ['ES2022'],
  },
};

let root: string;

function write(relative: string, text: string): void {
  const file = path.join(root, relative);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, text);
}

function writePackage(index: number, source: string): void {
  const folder = `packages/p${String(index)}`;
  write(`${folder}/package.json`, JSON.stringify({ name: `@ws/p${String(index)}`, private: true }));
  write(`${folder}/src/index.ts`, source);
  write(`${folder}/tsconfig.json`, JSON.stringify(CONFIG));
}

function programFiles(index: number): string[] {
  const projectRoot = path.join(root, 'packages', `p${String(index)}`);
  const layout = resolveLayoutFor({ layout: {} });
  const program = createProjectProgram({
    projectRoot,
    configPath: path.join(projectRoot, 'tsconfig.json'),
    packagesInfo: loadPackages(projectRoot, layout),
    layout,
  });
  return program
    .getRootFileNames()
    .map((file) => path.relative(root, file))
    .toSorted();
}

beforeAll(() => {
  root = mkdtempSync(path.join(tmpdir(), 'nitpicker-siblings-'));
  mkdirSync(path.join(root, '.git'));
  write('package.json', JSON.stringify({ name: 'ws', private: true, workspaces: ['packages/*'] }));
  for (const index of Array.from({ length: PACKAGES }, (_, position) => position)) {
    writePackage(index, `export const value${String(index)} = ${String(index)};\n`);
  }
  writePackage(1, "import { value0 } from '@ws/p0';\nexport const one = value0;\n");
  writePackage(2, "export * from '@ws/p0';\n");
  writePackage(3, "import { value0 } from '@ws/p2';\nexport const three = value0;\n");
  writePackage(4, "import { value0 } from '../../p0/src/index';\nexport const four = value0;\n");
  writePackage(5, "import { one } from '@ws/p1';\nexport const five = one;\n");
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('the program of one package in a large workspace', () => {
  it('holds only the package and the sibling files that can reach its exports', () => {
    expect(programFiles(0)).toEqual([
      'packages/p0/src/index.ts',
      'packages/p1/src/index.ts',
      'packages/p2/src/index.ts',
      'packages/p3/src/index.ts',
      'packages/p4/src/index.ts',
    ]);
  });

  it('holds only its own files when no sibling imports it', () => {
    expect(programFiles(150)).toEqual(['packages/p150/src/index.ts']);
  });

  it('leaves out a sibling file deleted after it was listed', () => {
    const projectRoot = path.join(root, 'packages', 'p0');
    const sibling = path.join(root, 'packages', 'p1', 'src');
    const { packages } = loadPackages(projectRoot, resolveLayoutFor({ layout: {} }));

    const files = relevantSiblingFiles({
      projectRoot,
      files: [path.join(sibling, 'gone.ts'), path.join(sibling, 'index.ts')],
      packages,
      options: {},
    });

    expect(files).toEqual([path.join(sibling, 'index.ts')]);
  });

  it('is built once for the unused-API and design analyses of one project', () => {
    const projectRoot = path.join(root, 'packages', 'p7');
    const layout = resolveLayoutFor({ layout: {} });
    const request = {
      projectRoot,
      configPath: path.join(projectRoot, 'tsconfig.json'),
      packagesInfo: loadPackages(projectRoot, layout),
      layout,
    };

    const first = createProjectProgram(request);
    const second = createProjectProgram(request);
    const third = createProjectProgram(request);

    expect([second === first, third === first]).toEqual([true, false]);
  });
});
