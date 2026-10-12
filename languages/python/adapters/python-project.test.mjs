import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  detectFormatter,
  detectSourceRoots,
  detectTargetVersion,
  detectTypeChecker,
  importRoots,
} from './python-project.mjs';

const roots = [];

function project(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-python-project-'));
  roots.push(root);
  for (const [relative, contents] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
    writeFileSync(path.join(root, relative), contents);
  }
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('type checker detection', () => {
  it.each([
    ['a [tool.mypy] table', { 'pyproject.toml': '[tool.mypy]\nstrict = true\n' }, 'mypy'],
    ['a mypy override table', { 'pyproject.toml': '[[tool.mypy.overrides]]\n' }, 'mypy'],
    ['mypy.ini', { 'mypy.ini': '[mypy]\n' }, 'mypy'],
    ['.mypy.ini', { '.mypy.ini': '' }, 'mypy'],
    [
      'a [mypy] section in setup.cfg',
      { 'setup.cfg': '[mypy]\nignore_missing_imports = True\n' },
      'mypy',
    ],
    ['a per-module mypy section', { 'tox.ini': '[mypy-numpy.*]\n' }, 'mypy'],
    ['a requirements line', { 'requirements-dev.txt': 'pytest\nmypy==1.9\n' }, 'mypy'],
    [
      'a poetry dependency',
      { 'pyproject.toml': '[tool.poetry.dev-dependencies]\nmypy = "^1"\n' },
      'mypy',
    ],
    [
      'a pre-commit hook',
      { '.pre-commit-config.yaml': '  - repo: https://github.com/pre-commit/mirrors-mypy\n' },
      'mypy',
    ],
    ['a [tool.pyright] table', { 'pyproject.toml': '[tool.pyright]\n' }, 'pyright'],
    ['pyrightconfig.json', { 'pyrightconfig.json': '{}' }, 'pyright'],
    ['a requirements line', { 'requirements.txt': 'pyright>=1.1\n' }, 'pyright'],
    [
      'a quoted PEP 621 dependency',
      { 'pyproject.toml': 'dev = [\n  "pyright>=1",\n]\n' },
      'pyright',
    ],
    [
      'the pyright-python hook',
      { '.pre-commit-config.yaml': '  - repo: https://github.com/RobertCraigie/pyright-python\n' },
      'pyright',
    ],
  ])('finds the checker from %s', (_name, files, expected) => {
    expect(detectTypeChecker(project(files), undefined)).toBe(expected);
  });

  it.each([
    ['nothing', {}],
    ['other tools only', { 'requirements.txt': 'pytest\nmypyc-extras\npyright-helper\n' }],
    ['a mention in a word', { 'pyproject.toml': 'description = "all about mypy"\n' }],
  ])('finds none from %s', (_name, files) => {
    expect(detectTypeChecker(project(files), undefined)).toBeUndefined();
  });

  it('prefers the checker with a configuration over one that is only a dependency', () => {
    const files = { 'requirements.txt': 'mypy\n', 'pyrightconfig.json': '{}' };

    expect(detectTypeChecker(project(files), undefined)).toBe('pyright');
  });

  it('prefers a configured checker that is also a dependency', () => {
    const files = {
      'pyproject.toml': '[tool.pyright]\n[tool.mypy]\n',
      'requirements.txt': 'pyright\n',
    };

    expect(detectTypeChecker(project(files), undefined)).toBe('pyright');
  });

  it('takes mypy when both are equally present', () => {
    const files = { 'pyproject.toml': '[tool.pyright]\n[tool.mypy]\n' };

    expect(detectTypeChecker(project(files), undefined)).toBe('mypy');
  });

  it('takes the setting over any detection', () => {
    expect(detectTypeChecker(project({ 'mypy.ini': '' }), 'pyright')).toBe('pyright');
  });
});

describe('formatter detection', () => {
  it.each([
    ['a [tool.black] table', { 'pyproject.toml': '[tool.black]\nline-length = 100\n' }, 'black'],
    [
      'a PEP 621 dependency',
      {
        'pyproject.toml':
          '[project]\ndependencies = []\n[dependency-groups]\ndev = [\n  "black>=24",\n]\n',
      },
      'black',
    ],
    [
      'a poetry dependency',
      { 'pyproject.toml': '[tool.poetry.dev-dependencies]\nblack = "^24"\n' },
      'black',
    ],
    ['a requirements line', { 'requirements-dev.txt': 'pytest\nblack==24.1.0\n' }, 'black'],
    [
      'a pre-commit hook',
      {
        '.pre-commit-config.yaml':
          'repos:\n  - repo: https://github.com/psf/black\n    rev: 24.1.0\n',
      },
      'black',
    ],
    [
      'a [tool.ruff.format] table',
      { 'pyproject.toml': '[tool.black]\n[tool.ruff.format]\n' },
      'ruff',
    ],
    [
      'the ruff-format hook beside black',
      { '.pre-commit-config.yaml': 'black\nruff-format\n' },
      'ruff',
    ],
    [
      'a [format] table in ruff.toml',
      { 'ruff.toml': '[format]\nquote-style = "single"\n', 'requirements.txt': 'black\n' },
      'ruff',
    ],
    [
      'a one-line dependency array',
      { 'pyproject.toml': '[project.optional-dependencies]\ndev = ["pytest", "black>=24"]\n' },
      'black',
    ],
    ['a requirements file in a directory', { 'requirements/dev.txt': 'black==24.1.0\n' }, 'black'],
    ['a requirements-test file', { 'requirements-test.txt': 'black\n' }, 'black'],
    [
      'the black pre-commit mirror',
      {
        '.pre-commit-config.yaml':
          'repos:\n  - repo: https://github.com/psf/black-pre-commit-mirror\n    rev: 24.1.0\n',
      },
      'black',
    ],
    [
      'a pre-commit hook id',
      { '.pre-commit-config.yaml': 'repos:\n  - repo: local\n    hooks:\n      - id: black\n' },
      'black',
    ],
    ['a tox command', { 'tox.ini': '[testenv:lint]\ncommands = black --check .\n' }, 'black'],
    ['no hint', { 'pyproject.toml': '[project]\nname = "x"\n' }, 'ruff'],
    ['no configuration file', {}, 'ruff'],
    ['a similarly named package', { 'requirements.txt': 'black-macchiato\nblackd\n' }, 'ruff'],
  ])('picks the formatter from %s', (_, files, expected) => {
    expect(detectFormatter(project(files))).toBe(expected);
  });

  it('prefers the explicit setting', () => {
    const root = project({ 'pyproject.toml': '[tool.black]\n' });

    expect(detectFormatter(root, 'ruff')).toBe('ruff');
    expect(detectFormatter(project({}), 'black')).toBe('black');
  });
});

describe('source root detection', () => {
  it('uses src when it exists', () => {
    expect(
      detectSourceRoots(project({ 'src/demo/__init__.py': '', 'other/__init__.py': '' })),
    ).toEqual(['src']);
  });

  it('uses the top-level packages of a flat layout, without tests and hidden folders', () => {
    const root = project({
      'zeta/__init__.py': '',
      'alpha/__init__.py': '',
      'tests/__init__.py': '',
      '.hidden/__init__.py': '',
      'docs/__init__.py': '',
      'data/readme.txt': '',
      'app.py': '',
    });

    expect(detectSourceRoots(root)).toEqual(['alpha', 'zeta']);
  });

  it('falls back to the project root', () => {
    expect(detectSourceRoots(project({ 'app.py': '' }))).toEqual(['.']);
  });

  it('normalizes configured roots', () => {
    expect(detectSourceRoots(project({}), ['./lib/', 'a\\b', '.'])).toEqual(['lib', 'a/b', '.']);
  });
});

describe('import roots', () => {
  it('imports from a source directory itself and from the parent of a package', () => {
    const root = project({
      'src/demo/__init__.py': '',
      'pkg/__init__.py': '',
      'pkg2/__init__.py': '',
    });

    expect(importRoots(root, ['src', 'pkg', 'pkg2'])).toEqual([path.join(root, 'src'), root]);
  });

  it('resolves against the given project', () => {
    const root = project({});

    expect(importRoots(root, ['.'])).toEqual([root]);
  });
});

describe('target version detection', () => {
  it.each([
    ['PEP 621', { 'pyproject.toml': '[project]\nrequires-python = ">=3.10"\n' }, 'py310'],
    ['an upper bound beside it', { 'pyproject.toml': 'requires-python = ">=3.9,<3.13"\n' }, 'py39'],
    ['two lower bounds', { 'pyproject.toml': 'requires-python = ">=3.8,>=3.11"\n' }, 'py311'],
    ['an exclusive bound', { 'pyproject.toml': 'requires-python = ">3.9"\n' }, 'py310'],
    ['a compatible release', { 'pyproject.toml': 'requires-python = "~=3.11.2"\n' }, 'py311'],
    ['poetry alternatives', { 'pyproject.toml': 'python = "^3.12 || ^3.9"\n' }, 'py39'],
    ['setup.cfg', { 'setup.cfg': '[options]\npython_requires = >=3.9\n' }, 'py39'],
    [
      'a version older than the oldest supported',
      { 'pyproject.toml': 'requires-python = ">=3.6"\n' },
      'py38',
    ],
    [
      'a bound without a minor version we know',
      { 'pyproject.toml': 'requires-python = ">=2.7"\n' },
      'py38',
    ],
    ['no declaration', { 'pyproject.toml': '[project]\nname = "x"\n' }, 'py38'],
    ['no configuration file', {}, 'py38'],
  ])('reads %s', (_, files, expected) => {
    expect(detectTargetVersion(project(files))).toBe(expected);
  });
});
