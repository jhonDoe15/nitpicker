import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_NORECURSEDIRS,
  DEFAULT_PYTHON_FILES,
  readPytestConfig,
  readPythonFiles,
  shellWords,
} from './pytest-config.mjs';

const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function project(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-pytest-config-'));
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

  it('come from pyproject.toml, as a string or a list, in either table', () => {
    const asString = project({
      'pyproject.toml': '[tool.pytest.ini_options]\npython_files = "check_*.py tests.py"\n',
    });
    const asList = project({
      'pyproject.toml': '[tool.pytest.ini_options]\npython_files = ["check_*.py", "tests.py"]\n',
    });
    const native = project({
      'pyproject.toml': '[tool.pytest]\npython_files = ["native_*.py"]\n',
    });

    expect(readPythonFiles(asString)).toEqual(['check_*.py', 'tests.py']);
    expect(readPythonFiles(asList)).toEqual(['check_*.py', 'tests.py']);
    expect(readPythonFiles(native)).toEqual(['native_*.py']);
  });

  it('come from pytest.toml and .pytest.toml', () => {
    const visible = project({ 'pytest.toml': '[pytest]\npython_files = ["own_*.py"]\n' });
    const hidden = project({ '.pytest.toml': '[pytest]\npython_files = ["hidden_*.py"]\n' });

    expect(readPythonFiles(visible)).toEqual(['own_*.py']);
    expect(readPythonFiles(hidden)).toEqual(['hidden_*.py']);
  });

  it('come from tox.ini and setup.cfg', () => {
    const tox = project({ 'tox.ini': '[pytest]\npython_files = tox_*.py\n' });
    const setup = project({ 'setup.cfg': '[tool:pytest]\npython_files = setup_*.py\n' });

    expect(readPythonFiles(tox)).toEqual(['tox_*.py']);
    expect(readPythonFiles(setup)).toEqual(['setup_*.py']);
  });

  it('prefer pytest.toml, pytest.ini, then pyproject.toml, over the other files', () => {
    const files = {
      'pytest.ini': '[pytest]\npython_files = ini_*.py\n',
      'pyproject.toml': '[tool.pytest.ini_options]\npython_files = "toml_*.py"\n',
      'tox.ini': '[pytest]\npython_files = tox_*.py\n',
    };

    expect(readPythonFiles(project(files))).toEqual(['ini_*.py']);
    expect(readPythonFiles(project({ ...files, 'pytest.ini': '[pytest]\n' }))).toEqual(
      DEFAULT_PYTHON_FILES,
    );
    expect(
      readPythonFiles(
        project({ ...files, 'pytest.toml': '[pytest]\npython_files = ["own_*.py"]\n' }),
      ),
    ).toEqual(['own_*.py']);
    expect(readPythonFiles(project({ 'pyproject.toml': files['pyproject.toml'] }))).toEqual([
      'toml_*.py',
    ]);
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

describe('the rest of the collection settings', () => {
  it('default to the pytest defaults', () => {
    expect(readPytestConfig(project({}))).toEqual({
      pythonFiles: DEFAULT_PYTHON_FILES,
      pythonClasses: ['Test'],
      pythonFunctions: ['test'],
      norecursedirs: DEFAULT_NORECURSEDIRS,
      testpaths: [],
      xfailStrict: false,
      addopts: [],
    });
  });

  it('read classes, functions, directories, test paths and options from pytest.ini', () => {
    const root = project({
      'pytest.ini': [
        '[pytest]',
        'python_classes = Check *Suite',
        'python_functions = check_*',
        'norecursedirs = slow legacy',
        'testpaths = tests unit',
        'addopts = -q --deselect "tests/a.py::test one" -k "not slow"',
      ].join('\n'),
    });

    expect(readPytestConfig(root)).toEqual({
      pythonFiles: DEFAULT_PYTHON_FILES,
      pythonClasses: ['Check', '*Suite'],
      pythonFunctions: ['check_*'],
      norecursedirs: ['slow', 'legacy'],
      testpaths: ['tests', 'unit'],
      xfailStrict: false,
      addopts: ['-q', '--deselect', 'tests/a.py::test one', '-k', 'not slow'],
    });
  });

  it('read a list of options from pyproject.toml', () => {
    const root = project({
      'pyproject.toml': '[tool.pytest]\naddopts = ["-q", "--ignore=tests/old"]\n',
    });

    expect(readPytestConfig(root).addopts).toEqual(['-q', '--ignore=tests/old']);
  });

  it.each([
    ['pytest.ini', '[pytest]\nxfail_strict = true\n'],
    ['pytest.ini', '[pytest]\nxfail_strict = 1\n'],
    ['pyproject.toml', '[tool.pytest.ini_options]\nxfail_strict = true\n'],
    ['setup.cfg', '[tool:pytest]\nxfail_strict = True\n'],
    ['pytest.ini', '[pytest]\nxfail_strict = true ; always\n'],
    ['pytest.ini', '[pytest]\nxfail_strict = true # always\n'],
    ['pytest.ini', '[pytest]\naddopts = -o xfail_strict=true\n'],
    ['pytest.ini', '[pytest]\naddopts = -q -o xfail_strict=True\n'],
    ['pytest.ini', '[pytest]\naddopts = -oxfail_strict=1\n'],
    ['pytest.ini', '[pytest]\naddopts = --override-ini xfail_strict=true\n'],
    ['pytest.ini', '[pytest]\naddopts = --override-ini=xfail_strict=true\n'],
    ['pytest.ini', '[pytest]\nxfail_strict = false\naddopts = -o xfail_strict=true\n'],
    ['pyproject.toml', '[tool.pytest.ini_options]\naddopts = "-o xfail_strict=true"\n'],
  ])('read xfail_strict from %s', (file, text) => {
    expect(readPytestConfig(project({ [file]: text })).xfailStrict).toBe(true);
  });

  it.each([
    ['pytest.ini', '[pytest]\nxfail_strict = false\n'],
    ['pytest.ini', '[pytest]\nxfail_strict = false ; not yet\n'],
    ['pytest.ini', '[pytest]\naddopts = -q\n'],
    ['pytest.ini', '[pytest]\nxfail_strict = true\naddopts = -o xfail_strict=false\n'],
    ['pytest.ini', '[pytest]\naddopts = -o other=true\n'],
  ])('leave xfail_strict off for %s', (file, text) => {
    expect(readPytestConfig(project({ [file]: text })).xfailStrict).toBe(false);
  });

  it('split options like a shell', () => {
    expect(shellWords(`-k 'a b' --x="c d" ""`)).toEqual(['-k', 'a b', '--x=c d', '']);
  });
});
