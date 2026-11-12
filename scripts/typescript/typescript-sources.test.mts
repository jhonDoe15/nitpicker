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
  doubledModules,
  moduleImports,
  shippedTypeScriptImports,
  trackedModules,
  unresolvedTypeScriptImports,
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
});

let template: string;

beforeAll(() => {
  template = mkdtempSync(path.join(tmpdir(), 'nitpicker-typescript-template-'));
  writeFiles(template, SAMPLE);
  for (const command of [
    ['init', '--quiet'],
    ['add', '.'],
  ]) {
    execFileSync('git', command, { cwd: template, env: HERMETIC_GIT, timeout: 10_000 });
  }
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
