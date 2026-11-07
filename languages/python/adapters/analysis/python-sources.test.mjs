import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createScratch } from '../test-support/scratch.mjs';
import {
  existingSourceRoots,
  functionText,
  listProductionModules,
  NON_PRODUCTION_GLOBS,
  nonProductionGlobs,
  pythonSourceFiles,
  writeSourceListing,
} from './python-sources.mjs';

const scratch = createScratch();

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

  it('skips tests, environments, hidden directories and build output, and Django test names only in Django', () => {
    const root = project([
      'app/__init__.py',
      'app/keep.py',
      'app/tests/test_keep.py',
      'app/test/helper.py',
      'app/test_keep.py',
      'app/keep_test.py',
      'app/tests.py',
      'app/keep_tests.py',
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
      'app/keep_tests.py',
      'app/tests.py',
    ]);
    writeFileSync(
      path.join(root, 'pyproject.toml'),
      '[project]\nname = "app"\ndependencies = ["Django>=5"]\n',
    );
    expect(listProductionModules(root, ['.']).map(({ file }) => file)).toEqual([
      'app/__init__.py',
      'app/keep.py',
    ]);
  });

  it('skips documentation, examples, scripts and testing at the top of a project that is its own root', () => {
    const root = project([
      'app/__init__.py',
      'docs/conf.py',
      'doc/conf.py',
      'examples/demo.py',
      'scripts/release.py',
      'testing/fakes.py',
      'app/scripts/keep.py',
      'app/testing/fakes.py',
    ]);

    expect(listProductionModules(root, ['.']).map(({ file }) => file)).toEqual([
      'app/__init__.py',
      'app/scripts/keep.py',
      'app/testing/fakes.py',
    ]);
    expect(listProductionModules(root, ['app']).map(({ file }) => file)).toEqual([
      'app/__init__.py',
      'app/scripts/keep.py',
      'app/testing/fakes.py',
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

  it('adds the documentation directories when the project is its own root, and Django test names', () => {
    const plain = project([]);
    const django = project(['manage.py']);

    expect(nonProductionGlobs(['src'], plain)).toEqual(NON_PRODUCTION_GLOBS);
    expect(nonProductionGlobs(['.'], plain).slice(NON_PRODUCTION_GLOBS.length)).toEqual([
      'docs/**',
      'doc/**',
      'examples/**',
      'scripts/**',
      'testing/**',
    ]);
    expect(nonProductionGlobs(['src'], django).slice(NON_PRODUCTION_GLOBS.length)).toEqual([
      '**/tests.py',
      '**/tests_*.py',
      '**/*_tests.py',
    ]);
  });

  it('replaces the skipped folders of the duplicate scan with the project list', () => {
    expect(nonProductionGlobs(['src'], project([]), ['dist', 'tests'])).toEqual([
      '**/__pycache__/**',
      '**/venv/**',
      '**/node_modules/**',
      '**/site-packages/**',
      '**/dist/**',
      '**/tests/**',
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
    expect(nonProductionGlobs(['.'], project([]), [])).toEqual([
      '**/__pycache__/**',
      '**/venv/**',
      '**/node_modules/**',
      '**/site-packages/**',
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
      'docs/**',
      'doc/**',
      'examples/**',
      'scripts/**',
      'testing/**',
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

afterEach(scratch.cleanup);

describe('pythonSourceFiles', () => {
  it('lists the Python files under the source roots, sorted, without hidden or vendored directories', () => {
    const root = scratch.write(scratch.directory(), {
      'src/demo/b.py': '',
      'src/demo/a.py': '',
      'src/demo/notes.txt': '',
      'src/demo/__pycache__/a.py': '',
      'src/.hidden/x.py': '',
      'src/node_modules/y.py': '',
      'src/lib/site-packages/z.py': '',
    });

    expect(pythonSourceFiles(root, ['src'])).toEqual(['src/demo/a.py', 'src/demo/b.py']);
  });

  it('lists every file once when the roots overlap and skips roots that do not exist', () => {
    const root = scratch.write(scratch.directory(), {
      'pkg/a.py': '',
      'top.py': '',
      '.venv/lib/v.py': '',
    });

    expect(pythonSourceFiles(root, ['pkg', '.', 'missing'])).toEqual(['pkg/a.py', 'top.py']);
  });
});

describe('pythonSourceFiles for a flat project', () => {
  it('leaves tests, conftest, build copies and virtualenvs out when the source root is the project', () => {
    const root = scratch.write(scratch.directory(), {
      'app.py': '',
      'util/helpers.py': '',
      'conftest.py': '',
      'tests/test_app.py': '',
      'util/tests/test_helpers.py': '',
      'testing/fakes.py': '',
      'util/testing/fakes.py': '',
      'build/lib/app.py': '',
      'dist/app.py': '',
      'env/lib/sitecustomize.py': '',
      'venv/lib/sitecustomize.py': '',
      '.venv/lib/v.py': '',
    });

    expect(pythonSourceFiles(root, ['.'])).toEqual([
      'app.py',
      'util/helpers.py',
      'util/testing/fakes.py',
    ]);
  });

  it('keeps a package named reports, where nitpicker writes its own output', () => {
    const root = scratch.write(scratch.directory(), {
      'app.py': '',
      'reports/monthly.py': '',
      'app_pkg/reports/__init__.py': '',
    });

    expect(pythonSourceFiles(root, ['.'])).toEqual([
      'app.py',
      'app_pkg/reports/__init__.py',
      'reports/monthly.py',
    ]);
  });

  it('keeps the files of a root that is itself named like a test directory', () => {
    const root = scratch.write(scratch.directory(), {
      'tests/test_app.py': '',
      'tests/conftest.py': '',
      'tests/tests/inner.py': '',
    });

    expect(pythonSourceFiles(root, ['tests'])).toEqual([
      'tests/conftest.py',
      'tests/test_app.py',
      'tests/tests/inner.py',
    ]);
  });
});

describe('writeSourceListing', () => {
  it('writes one path per line to the report directory', () => {
    const root = scratch.write(scratch.directory(), { 'src/a.py': '', 'src/b.py': '' });
    const reportRoot = scratch.directory();

    const { files, listing } = writeSourceListing({
      projectRoot: root,
      reportRoot,
      project: { sourceRoots: ['src'] },
    });

    expect(files).toEqual(['src/a.py', 'src/b.py']);
    expect(readFileSync(listing, 'utf8')).toBe('src/a.py\nsrc/b.py');
    expect(path.dirname(listing)).toBe(reportRoot);
  });
});

describe('functionText', () => {
  const textOf = (source, range) =>
    functionText(new Map([['f.py', source.split('\n')]]), '/unused', { file: 'f.py', ...range });

  it('removes the common indentation and keeps the nesting inside the function', () => {
    const source = [
      'class A:',
      '    def m(self):',
      '        if self:',
      '            return 1',
      '',
    ].join('\n');

    expect(textOf(source, { start: 2, end: 4 })).toBe(
      ['def m(self):', '    if self:', '        return 1'].join('\n'),
    );
  });

  it('tells a statement moved into a block from the same statement outside it', () => {
    const flat = ['def f(x):', '    if x:', '        a()', '    b()'].join('\n');
    const nested = ['def f(x):', '    if x:', '        a()', '        b()'].join('\n');

    expect(textOf(flat, { start: 1, end: 4 })).not.toBe(textOf(nested, { start: 1, end: 4 }));
  });

  it('ignores trailing whitespace, blank lines and where the function is indented', () => {
    const shallow = 'def f():  \n\n    return 1';
    const deep = '        def f():\n\n            return 1';

    expect(textOf(deep, { start: 1, end: 3 })).toBe(textOf(shallow, { start: 1, end: 3 }));
  });
});
