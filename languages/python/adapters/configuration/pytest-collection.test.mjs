import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_PYTHON_FILES, readPythonFiles } from './pytest-collection.mjs';

const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function project(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-pytest-collection-'));
  roots.push(root);
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), content);
  }
  return root;
}

describe('the files pytest collects', () => {
  it('default to test_*.py and *_test.py', () => {
    expect(readPythonFiles(project({}))).toEqual(['test_*.py', '*_test.py']);
    expect(DEFAULT_PYTHON_FILES).toEqual(['test_*.py', '*_test.py']);
  });

  it('come from pytest.ini', () => {
    const root = project({ 'pytest.ini': '[pytest]\npython_files = check_*.py *_check.py\n' });

    expect(readPythonFiles(root)).toEqual(['check_*.py', '*_check.py']);
  });

  it('come from a list continued over several lines', () => {
    const root = project({
      'pytest.ini': '[pytest]\npython_files =\n    check_*.py\n    tests.py\naddopts = -q\n',
    });

    expect(readPythonFiles(root)).toEqual(['check_*.py', 'tests.py']);
  });

  it('come from pyproject.toml, as a string or a list', () => {
    const asString = project({
      'pyproject.toml': '[tool.pytest.ini_options]\npython_files = "check_*.py tests.py"\n',
    });
    const asList = project({
      'pyproject.toml': '[tool.pytest.ini_options]\npython_files = ["check_*.py", "tests.py"]\n',
    });

    expect(readPythonFiles(asString)).toEqual(['check_*.py', 'tests.py']);
    expect(readPythonFiles(asList)).toEqual(['check_*.py', 'tests.py']);
  });

  it('come from tox.ini and setup.cfg', () => {
    const tox = project({ 'tox.ini': '[pytest]\npython_files = tox_*.py\n' });
    const setup = project({ 'setup.cfg': '[tool:pytest]\npython_files = setup_*.py\n' });

    expect(readPythonFiles(tox)).toEqual(['tox_*.py']);
    expect(readPythonFiles(setup)).toEqual(['setup_*.py']);
  });

  it('prefer pytest.ini, then pyproject.toml, over the other files', () => {
    const files = {
      'pytest.ini': '[pytest]\npython_files = ini_*.py\n',
      'pyproject.toml': '[tool.pytest.ini_options]\npython_files = "toml_*.py"\n',
      'tox.ini': '[pytest]\npython_files = tox_*.py\n',
    };

    expect(readPythonFiles(project(files))).toEqual(['ini_*.py']);
    expect(readPythonFiles(project({ ...files, 'pytest.ini': '[pytest]\n' }))).toEqual(
      DEFAULT_PYTHON_FILES,
    );
    const { 'pytest.ini': _ignored, ...rest } = files;

    expect(readPythonFiles(project(rest))).toEqual(['toml_*.py']);
  });

  it.each([
    [
      'a pyproject.toml without a pytest section',
      { 'pyproject.toml': '[tool.black]\nline-length = 88\n' },
    ],
    ['an invalid pyproject.toml', { 'pyproject.toml': '[tool.pytest\n' }],
    ['an empty python_files', { 'pytest.ini': '[pytest]\npython_files =\n' }],
    ['another section', { 'tox.ini': '[testenv]\npython_files = x.py\n' }],
  ])('stay the default with %s', (_name, files) => {
    expect(readPythonFiles(project(files))).toEqual(DEFAULT_PYTHON_FILES);
  });
});
