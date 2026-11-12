import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { writeFiles } from '../../core/diff/git/test-support/fixture-files.mjs';
import { printConversion } from './convert.mts';
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
import { printReadiness, readiness } from './ready.mts';

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

const SAMPLE = {
  'nitpicker.config.json': '{ "layout": { "entryPoints": ["core/cli.mjs"] } }\n',
  'core/cli.mjs': "import { run } from './run.mjs';\nrun();\n",
  'core/run.mjs': "import { text } from '../shared/text.mjs';\nexport const run = () => text;\n",
  'core/run.test.mjs': "import { run } from './run.mjs';\n",
  'shared/text.mjs': "export const text = 'text';\n",
  'shared/worker.mjs': "const worker = new URL('./text.mjs', import.meta.url);\n",
  'docs/notes.md': 'See core/run.mjs.\n',
};

describe('the repository during the TypeScript conversion', () => {
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

describe('module URLs during the conversion', () => {
  it('reports a converted module that code still opens by its packaged URL without the helper', () => {
    const root = project({
      'core/start.mjs': [
        "const plain = new URL('./worker.mjs', import.meta.url);",
        "const helped = checkoutModuleUrl(new URL('./worker.mjs', import.meta.url));",
        "const kept = new URL('./kept.mjs', import.meta.url);",
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

let template: string;

function track(root: string): void {
  for (const command of [
    ['init', '--quiet'],
    ['add', '.'],
  ]) {
    execFileSync('git', command, { cwd: root, env: HERMETIC_GIT, timeout: 10_000 });
  }
}

beforeAll(() => {
  template = mkdtempSync(path.join(tmpdir(), 'nitpicker-typescript-template-'));
  writeFiles(template, SAMPLE);
  track(template);
});

afterAll(() => {
  rmSync(template, { recursive: true, force: true });
});

function sampleRepository(): string {
  const root = directory();
  cpSync(template, root, { recursive: true });
  return root;
}

describe('conversion readiness', () => {
  it('lists the modules of a folder whose shipped importers are converted or converting with them', () => {
    const root = sampleRepository();
    expect(readiness(root, 'core')).toEqual({
      ready: ['core/cli.mjs', 'core/run.mjs', 'core/run.test.mjs'],
      waiting: [],
    });
    expect(readiness(root, 'shared')).toEqual({
      ready: ['shared/worker.mjs'],
      waiting: ['shared/text.mjs (imported by core/run.mjs)'],
    });
  });
  it('prints the ready and the waiting modules', () => {
    const root = sampleRepository();
    const written: string[] = [];
    printReadiness(root, 'shared/', { write: (text) => written.push(text) });
    expect(written.join('')).toBe(
      [
        'Ready to convert together (1):',
        '  shared/worker.mjs',
        'Waiting on shipped JavaScript importers (1):',
        '  shared/text.mjs (imported by core/run.mjs)',
        '',
      ].join('\n'),
    );
  });
});

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
  it('holds the build scripts and the modules they import outside the shipped import chain', () => {
    const root = project(NODE_BUILD);
    track(root);
    expect(readiness(root, '.')).toEqual({
      ready: ['core/reference/render.mjs'],
      waiting: [
        'core/reference/generate.mjs (imported by scripts/reference/gen-rules.mjs on Node.js 22.14)',
        'core/reference/page.mjs (imported by core/reference/generate.mjs)',
        'languages/go/reference/entries.mjs (imported by scripts/reference/gen-rules.mjs on Node.js 22.14)',
        'scripts/reference/gen-rules.mjs (imported by the package build on Node.js 22.14)',
        'scripts/reference/registry.mjs (imported by scripts/reference/gen-rules.mjs on Node.js 22.14)',
        'scripts/typescript/emit.mjs (imported by the package build on Node.js 22.14)',
        'shared/files.mjs (imported by languages/go/reference/entries.mjs, scripts/typescript/emit.mjs on Node.js 22.14)',
        'shared/text.mjs (imported by scripts/reference/registry.mjs on Node.js 22.14)',
      ],
    });
  });
  it('refuses to convert a module that the build imports, naming the build script', () => {
    const root = project(NODE_BUILD);
    track(root);
    expect(() => {
      printConversion(root, ['shared/text.mjs'], { write: () => undefined });
    }).toThrow('shared/text.mjs <- scripts/reference/registry.mjs on Node.js 22.14');
  });
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
    const kept = project(NODE_BUILD);
    track(kept);
    const renamed = trackedModules(kept).filter((file) => file !== 'scripts/typescript/emit.mjs');
    expect(convertedNodeBuildModules(renamed, moduleImports(kept, renamed))).toEqual([
      'scripts/typescript/emit.mjs',
    ]);
  });
});

describe('converting modules', () => {
  it('renames the modules, rewrites their imports and config entries, and lists path references', () => {
    const root = sampleRepository();
    const written: string[] = [];
    printConversion(root, ['core/cli.mjs', 'core/run.mjs'], {
      write: (text) => written.push(text),
    });
    expect(existsSync(path.join(root, 'core/cli.mts'))).toBe(true);
    expect(read(root, 'core/cli.mts')).toBe("import { run } from './run.mts';\nrun();\n");
    expect(read(root, 'core/run.test.mjs')).toBe("import { run } from './run.mts';\n");
    expect(read(root, 'nitpicker.config.json')).toBe(
      '{ "layout": { "entryPoints": ["core/cli.mts"] } }\n',
    );
    expect(written.join('')).toBe(
      'Renamed and rewrote imports. Check these references by path:\n  docs/notes.md:1:See core/run.mjs.\n',
    );
  });
  it('refuses a module that shipped JavaScript still imports', () => {
    const root = sampleRepository();
    expect(() => {
      printConversion(root, ['shared/text.mjs'], { write: () => undefined });
    }).toThrow('shared/text.mjs <- core/run.mjs');
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
