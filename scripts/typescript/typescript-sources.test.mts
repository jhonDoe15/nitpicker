import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { writeFiles } from '../../core/diff/git/test-support/fixture-files.mts';
import { clean, emit, isShippedPath, transpiled } from './emit.mjs';
import {
  convertedNodeBuildModules,
  doubledModules,
  moduleImports,
  shippedTypeScriptImports,
  trackedModules,
  unresolvedTypeScriptImports,
  unwrappedModuleUrls,
} from './module-graph.mts';

const REPOSITORY_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const HERMETIC_GIT = {
  ...process.env,
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
};

function directory(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-typescript-sources-'));
  roots.push(root);
  return root;
}

function project(files: Record<string, string>): string {
  const root = directory();
  writeFiles(root, files);
  return root;
}

function read(root: string, file: string): string {
  return readFileSync(path.join(root, file), 'utf8');
}

describe('the TypeScript sources of the repository', () => {
  const modules = trackedModules(REPOSITORY_ROOT);
  const imports = moduleImports(REPOSITORY_ROOT, modules);

  it('ships no JavaScript module that imports a TypeScript module, which the package does not ship', () => {
    expect(shippedTypeScriptImports(imports)).toEqual([]);
  });
  it('holds no module as both .mjs and .mts', () => {
    expect(doubledModules(modules)).toEqual([]);
  });
  it('resolves every relative import of a TypeScript module', () => {
    expect(unresolvedTypeScriptImports(REPOSITORY_ROOT, imports)).toEqual([]);
  });
  it('opens converted modules by URL only through checkoutModuleUrl', () => {
    expect(unwrappedModuleUrls(REPOSITORY_ROOT, modules)).toEqual([]);
  });
  it('keeps the modules that the package build runs on Node.js 22.14 in JavaScript', () => {
    expect(convertedNodeBuildModules(modules, imports)).toEqual([]);
  });
});

describe('module URLs of converted modules', () => {
  it('reports a converted module that code still opens by its packaged URL without the helper', () => {
    const root = project({
      'core/start.mjs': [
        "const plain = new URL('./worker.mjs', import.meta.url);",
        "const helped = checkoutModuleUrl(new URL('./worker.mjs', import.meta.url));",
        "const kept = new URL('./kept.mjs', import.meta.url);",
        'const wrapped = checkoutModuleUrl(',
        "  new URL('./worker.mjs', import.meta.url),",
        ');',
        '',
      ].join('\n'),
      'core/worker.mts': 'export {};\n',
      'core/kept.mjs': 'export {};\n',
    });
    expect(unwrappedModuleUrls(root, ['core/start.mjs'])).toEqual([
      'core/start.mjs:1 ./worker.mjs',
    ]);
  });
});

function track(root: string): void {
  for (const command of [
    ['init', '--quiet'],
    ['add', '.'],
  ]) {
    execFileSync('git', command, { cwd: root, env: HERMETIC_GIT, timeout: 10_000 });
  }
}

const NODE_BUILD = {
  'scripts/typescript/emit.mjs': "import { files } from '../../shared/files.mjs';\n",
  'scripts/reference/gen-rules.mjs': [
    "import { registry } from './registry.mjs';",
    "import { entries } from '../../languages/go/reference/entries.mjs';",
    "const generate = await import('../../core/reference/generate.mjs');",
    '',
  ].join('\n'),
  'scripts/reference/registry.mjs': "import { text } from '../../shared/text.mjs';\n",
  'languages/go/reference/entries.mjs': "import { files } from '../../../shared/files.mjs';\n",
  'core/reference/generate.mjs': "import { page } from './page.mjs';\n",
  'core/reference/page.mjs': 'export const page = 1;\n',
  'core/reference/render.mjs': 'export const render = 1;\n',
  'shared/files.mjs': 'export const files = [];\n',
  'shared/text.mjs': "export const text = 'text';\n",
};

describe('the package build on Node.js 22.14', () => {
  it('reports a converted or renamed module that the build runs', () => {
    const root = project({
      ...NODE_BUILD,
      'scripts/reference/registry.mjs': "import { text } from '../../shared/text.mts';\n",
      'shared/text.mts': "export const text = 'text';\n",
    });
    track(root);
    const modules = trackedModules(root).filter((file) => file !== 'shared/text.mjs');
    expect(convertedNodeBuildModules(modules, moduleImports(root, modules))).toEqual([
      'shared/text.mts',
    ]);
    const { 'scripts/typescript/emit.mjs': emitSource, ...rest } = NODE_BUILD;
    const renamed = project({ ...rest, 'scripts/typescript/emit.mts': emitSource });
    track(renamed);
    const renamedModules = trackedModules(renamed);
    expect(
      convertedNodeBuildModules(renamedModules, moduleImports(renamed, renamedModules)),
    ).toEqual(['scripts/typescript/emit.mts']);
  });
});

describe('the package emit', () => {
  const typescript: unknown = createRequire(import.meta.url)('typescript-js-api');

  it('strips types and points relative imports of TypeScript modules at the emitted JavaScript', () => {
    const source = [
      "import { type Text, text } from './text.mts';",
      "import { other } from './other.mjs';",
      'export const value: Text = text + other;',
      '',
    ].join('\n');
    expect(transpiled(source, 'value.mts', typescript)).toBe(
      'import { text } from "./text.mjs";\nimport { other } from \'./other.mjs\';\nexport const value = text + other;\n',
    );
  });
  it('emits beside shipped sources only and removes the emitted files again', () => {
    const root = project({
      'core/run.mts': 'export const run = (): number => 1;\n',
      'core/run.test.mts': 'export {};\n',
      'core/test-support/helper.mts': 'export {};\n',
      'scripts/tool.mts': 'export {};\n',
    });
    emit(root);
    expect(read(root, 'core/run.mjs')).toBe('export const run = () => 1;\n');
    expect(
      ['core/run.test.mjs', 'core/test-support/helper.mjs', 'scripts/tool.mjs'].filter((file) =>
        existsSync(path.join(root, file)),
      ),
    ).toEqual([]);
    clean(root);
    expect(existsSync(path.join(root, 'core/run.mjs'))).toBe(false);
  });
  it('treats tests, fixtures and test support as unshipped', () => {
    expect(
      [
        'core/cli.mts',
        'core/cli.test.mts',
        'core/fixtures/a.mts',
        'shared/test-support/a.mts',
        'languages/java/__tests__/a.mts',
        'scripts/a.mts',
      ].filter((file) => isShippedPath(file)),
    ).toEqual(['core/cli.mts']);
  });
});
