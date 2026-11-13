import { mkdtempSync, rmSync, symlinkSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { compareText } from '../../../../../shared/paths/path-order.mjs';
import { runDeadCode } from '../runners/repository.mjs';
import { nestedPackageFolders, publishedSourceEntries } from './package-entries.mjs';

const packageRoot = path.resolve(import.meta.dirname, '../../../../..');
let directories;

beforeEach(() => {
  directories = [];
});

afterEach(() => {
  for (const directory of directories) rmSync(directory, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

function writeFiles(root, files) {
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(path.join(root, name), typeof text === 'string' ? text : JSON.stringify(text));
  }
}

function project(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-package-entries-'));
  directories.push(root);
  symlinkSync(path.join(packageRoot, 'node_modules'), path.join(root, 'node_modules'));
  writeFiles(root, files);
  return root;
}

function unusedFiles(root, layout = { sourceRoots: ['src'] }) {
  const policyFile = path.join(root, '.nitpicker-test-policy.json');
  writeFileSync(
    policyFile,
    JSON.stringify({ exclude: [], layout, exceptions: [], thresholds: {} }),
  );
  vi.stubEnv('NITPICKER_POLICY', policyFile);
  return runDeadCode({
    projectRoot: root,
    policyRoot: packageRoot,
    liveProjectRoot: packageRoot,
    analyzerName: 'dead-code',
    kind: 'dead-code',
  })
    .filter(({ rule }) => rule === 'files')
    .map(({ path: file }) => file)
    .toSorted(compareText);
}

const LIBRARY = {
  'package.json': {
    name: 'lib',
    type: 'module',
    main: './dist/index.js',
    exports: {
      '.': { types: './dist/index.d.ts', default: './dist/index.js' },
      './utils': { default: './dist/utils.js' },
      './vanilla/internals': { default: './dist/vanilla/internals.js' },
    },
  },
  'src/index.ts': "export const index = 'index';\n",
  'src/utils.ts': "export const utils = 'utils';\n",
  'src/vanilla/internals.ts': "export const internals = 'internals';\n",
  'src/dead.ts': "export const dead = 'dead';\n",
};

describe('published package entry points', () => {
  it('maps exports and main paths in the build output back to their sources', () => {
    expect(publishedSourceEntries(project(LIBRARY), ['src'])).toEqual([
      'src/index.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
      'src/utils.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
      'src/vanilla/internals.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
    ]);
  });

  it('are not reported as unused files, while a file nothing uses still is', () => {
    expect(unusedFiles(project(LIBRARY))).toEqual(['src/dead.ts']);
  });
});

const NESTED = {
  'package.json': { name: 'repo', type: 'module', private: true, workspaces: ['website'] },
  'pnpm-workspace.yaml': 'packages:\n  - .\n  - website\n',
  'src/main.ts': "export const main = 'main';\n",
  'src/dead.ts': "export const dead = 'dead';\n",
  'website/package.json': {
    name: 'site',
    private: true,
    dependencies: { gatsby: '5.0.0' },
  },
  'website/gatsby-browser.js': 'export const onClientEntry = () => {};\n',
  'website/api/contact.js': 'export default function handler() {}\n',
};

describe('a nested package with its own package.json', () => {
  it('is its own package: its folder is found', () => {
    expect(nestedPackageFolders(project(NESTED), ['src', 'test'])).toEqual(['website']);
  });

  it('leaves its files out of the root dead-code check, and still reports the root ones', () => {
    expect(unusedFiles(project(NESTED))).toEqual(['src/dead.ts']);
  });

  it('keeps a package folder inside a source root in the check', () => {
    const root = project({
      ...NESTED,
      'src/inner/package.json': { name: 'inner' },
      'src/inner/orphan.ts': 'export const orphan = 1;\n',
    });

    expect(nestedPackageFolders(root, ['src', 'test'])).toEqual(['website']);
  });
});

describe('a nested package that holds analyzed code', () => {
  const PACKAGE = {
    'package.json': { name: 'repo', private: true, workspaces: ['packages/core'] },
    'packages/core/package.json': { name: 'core', type: 'module', main: './src/main.ts' },
    'packages/core/src/main.ts': "export const main = 'main';\n",
    'packages/core/src/dead.ts': "export const dead = 'dead';\n",
  };

  it('is not left out when a source root is inside it', () => {
    const root = project(PACKAGE);

    expect(nestedPackageFolders(root, ['packages/core/src'])).toEqual([]);
    expect(unusedFiles(root, { sourceRoots: ['packages/core/src'] })).toEqual([
      'packages/core/src/dead.ts',
    ]);
  });

  it('is not left out when the source root is the project root', () => {
    expect(nestedPackageFolders(project(PACKAGE), ['.'])).toEqual([]);
  });
});

describe('published entries built with an outDir and rootDir', () => {
  it('map by the tsconfig before the naming heuristic', () => {
    const root = project({
      'package.json': { name: 'lib', main: './out/a.js', exports: { './b': './out/deep/b.js' } },
      'tsconfig.json': { compilerOptions: { rootDir: 'lib-src', outDir: 'out' } },
    });

    expect(publishedSourceEntries(root, ['src'])).toEqual([
      'lib-src/a.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
      'lib-src/deep/b.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
    ]);
  });
});
