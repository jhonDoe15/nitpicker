import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  existingSourceRoots,
  listProductionModules,
  NON_PRODUCTION_GLOBS,
  nonProductionGlobs,
} from './python-sources.mjs';

const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function project(files) {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-python-sources-')));
  roots.push(root);
  for (const file of files) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), '');
  }
  return root;
}

describe('listing production modules', () => {
  it('names modules from the import root of a src layout', () => {
    const root = project(['src/app/__init__.py', 'src/app/core.py', 'src/app/sub/__init__.py']);

    expect(listProductionModules(root, ['src'])).toEqual([
      { file: 'src/app/__init__.py', module: 'app', isPackage: true },
      { file: 'src/app/core.py', module: 'app.core', isPackage: false },
      { file: 'src/app/sub/__init__.py', module: 'app.sub', isPackage: true },
    ]);
  });

  it('names modules from the parent of a flat package', () => {
    const root = project(['app/__init__.py', 'app/core.py']);

    expect(listProductionModules(root, ['app']).map(({ module }) => module)).toEqual([
      'app',
      'app.core',
    ]);
  });

  it('keeps top-level scripts and namespace packages when the root is the project', () => {
    const root = project(['main.py', 'ns/part.py']);

    expect(listProductionModules(root, ['.'])).toEqual([
      { file: 'main.py', module: 'main', isPackage: false },
      { file: 'ns/part.py', module: 'ns.part', isPackage: false },
    ]);
  });

  it('skips tests, environments, hidden directories and build output', () => {
    const root = project([
      'app/__init__.py',
      'app/keep.py',
      'app/tests/test_keep.py',
      'app/test/helper.py',
      'app/test_keep.py',
      'app/keep_test.py',
      'app/conftest.py',
      'app/.hidden/secret.py',
      'app/__pycache__/keep.py',
      'app/node_modules/x.py',
      'app/site-packages/x.py',
      'app/venv/x.py',
      'app/build/x.py',
      'app/dist/x.py',
      'app/migrations/0001_initial.py',
      'app/data.txt',
    ]);

    expect(listProductionModules(root, ['.']).map(({ file }) => file)).toEqual([
      'app/__init__.py',
      'app/keep.py',
    ]);
  });

  it('skips documentation, examples and scripts at the top of a project that is its own root', () => {
    const root = project([
      'app/__init__.py',
      'docs/conf.py',
      'doc/conf.py',
      'examples/demo.py',
      'scripts/release.py',
      'app/scripts/keep.py',
    ]);

    expect(listProductionModules(root, ['.']).map(({ file }) => file)).toEqual([
      'app/__init__.py',
      'app/scripts/keep.py',
    ]);
    expect(listProductionModules(root, ['app']).map(({ file }) => file)).toEqual([
      'app/__init__.py',
      'app/scripts/keep.py',
    ]);
  });

  it('lists a module name once and skips roots that do not exist', () => {
    const root = project(['src/app/__init__.py', 'lib/app/__init__.py', 'lib/app/extra.py']);

    expect(listProductionModules(root, ['src', 'lib', 'missing'])).toEqual([
      { file: 'src/app/__init__.py', module: 'app', isPackage: true },
      { file: 'lib/app/extra.py', module: 'app.extra', isPackage: false },
    ]);
  });

  it('skips a top-level __init__ that names no module', () => {
    const root = project(['__init__.py']);

    expect(listProductionModules(root, ['.'])).toEqual([]);
  });

  it('filters source roots to the existing ones', () => {
    const root = project(['src/a.py']);

    expect(existingSourceRoots(root, ['src', 'lib'])).toEqual(['src']);
  });

  it('adds the documentation directories to the globs when the project is its own root', () => {
    expect(nonProductionGlobs(['src'])).toBe(NON_PRODUCTION_GLOBS);
    expect(nonProductionGlobs(['.']).slice(NON_PRODUCTION_GLOBS.length)).toEqual([
      'docs/**',
      'doc/**',
      'examples/**',
      'scripts/**',
    ]);
  });

  it('gives the duplicate scan the same exclusions', () => {
    expect(NON_PRODUCTION_GLOBS).toEqual([
      '**/__pycache__/**',
      '**/venv/**',
      '**/node_modules/**',
      '**/site-packages/**',
      '**/build/**',
      '**/dist/**',
      '**/tests/**',
      '**/test/**',
      '**/migrations/**',
      '**/.git/**',
      '**/.venv/**',
      '**/.tox/**',
      '**/.nox/**',
      '**/.eggs/**',
      '**/.mypy_cache/**',
      '**/.ruff_cache/**',
      '**/.pytest_cache/**',
      '**/test_*.py',
      '**/*_test.py',
      '**/conftest.py',
    ]);
  });
});
