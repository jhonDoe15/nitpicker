import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createScratch } from './fixtures/scratch.mjs';
import { functionText, pythonSourceFiles, writeSourceListing } from './python-sources.mjs';

const scratch = createScratch();

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
      'build/lib/app.py': '',
      'dist/app.py': '',
      'env/lib/sitecustomize.py': '',
      'venv/lib/sitecustomize.py': '',
      '.venv/lib/v.py': '',
    });

    expect(pythonSourceFiles(root, ['.'])).toEqual(['app.py', 'util/helpers.py']);
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
