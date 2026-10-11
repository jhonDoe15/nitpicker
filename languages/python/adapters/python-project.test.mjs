import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { detectFormatter, detectSourceRoots, importRoots } from './python-project.mjs';

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
