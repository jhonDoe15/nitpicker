import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  isDevelopmentGroup,
  normalizeRequirementName,
  readPythonDependencies,
  requirementName,
} from './python-dependencies.mjs';

const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function project(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-python-dependencies-'));
  roots.push(root);
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), content);
  }
  return root;
}

describe('requirement names', () => {
  it.each([
    ['pydantic>=2,<3', 'pydantic'],
    ['Pydantic_Settings[extra]==2.1 ; python_version >= "3.9"', 'pydantic-settings'],
    ['ruamel.yaml', 'ruamel-yaml'],
    ['attrs @ https://example.com/attrs.whl', 'attrs'],
    ['-e git+https://example.com/repo.git#egg=Local_Pkg', 'local-pkg'],
    ['marshmallow # validation', 'marshmallow'],
    ['-e ./local', undefined],
    ['-r base.txt', undefined],
    ['--index-url https://example.com', undefined],
    ['https://example.com/pkg.whl', undefined],
    ['# comment', undefined],
    ['', undefined],
  ])('reads %s', (line, expected) => {
    expect(requirementName(line)).toBe(expected);
  });

  it('normalizes the way PEP 503 does', () => {
    expect(normalizeRequirementName('Foo__Bar.baz-QUX')).toBe('foo-bar-baz-qux');
  });

  it.each([
    ['dev', true],
    ['test-extras', true],
    ['lint', true],
    ['docs', true],
    ['redis', false],
    ['all', false],
    ['latest', false],
  ])('classifies the group %s', (group, expected) => {
    expect(isDevelopmentGroup(group)).toBe(expected);
  });
});

describe('reading the dependencies of a project', () => {
  it('splits a PEP 621 project into runtime and development', () => {
    const root = project({
      'pyproject.toml': [
        '[project]',
        'name = "demo"',
        'dependencies = ["pydantic>=2", "requests"]',
        '[project.optional-dependencies]',
        'dev = ["pytest", "Mypy"]',
        'yaml = ["PyYAML"]',
        '[dependency-groups]',
        'lint = ["ruff"]',
        'typing = [{ include-group = "lint" }, "pyright"]',
        '',
      ].join('\n'),
    });

    expect(readPythonDependencies(root)).toEqual({
      runtime: ['pydantic', 'requests', 'pyyaml'],
      development: ['pytest', 'mypy', 'ruff', 'pyright'],
    });
  });

  it('reads Poetry dependencies, groups and the legacy dev table, without python', () => {
    const root = project({
      'pyproject.toml': [
        '[tool.poetry.dependencies]',
        'python = "^3.10"',
        'msgspec = "^0.18"',
        '[tool.poetry.group.dev.dependencies]',
        'pytest = "*"',
        '[tool.poetry.group.main.dependencies]',
        'structlog = "*"',
        '[tool.poetry.dev-dependencies]',
        'black = "*"',
        '',
      ].join('\n'),
    });

    expect(readPythonDependencies(root)).toEqual({
      runtime: ['msgspec', 'structlog'],
      development: ['pytest', 'black'],
    });
  });

  it('reads uv and pdm development tables', () => {
    const root = project({
      'pyproject.toml':
        '[tool.uv]\ndev-dependencies = ["pytest"]\n[tool.pdm.dev-dependencies]\ntest = ["coverage"]\n',
    });

    expect(readPythonDependencies(root)).toEqual({
      runtime: [],
      development: ['pytest', 'coverage'],
    });
  });

  it('reads requirements files by name, including a requirements directory', () => {
    const root = project({
      'requirements.txt': 'Cerberus==1.3\n-r extra.txt\n# comment\nloguru>=0.7 ; sys_platform\n',
      'requirements-dev.txt': 'pytest\nvoluptuous\n',
      'dev-requirements.in': 'tox\n',
      'requirements/base.txt': 'attrs\ncattrs\n',
      'requirements/test.txt': 'hypothesis\n',
      'notes.txt': 'unrelated\n',
    });

    expect(readPythonDependencies(root)).toEqual({
      runtime: ['cerberus', 'loguru', 'attrs', 'cattrs'],
      development: ['tox', 'pytest', 'voluptuous', 'hypothesis'],
    });
  });

  it('reads setup.cfg install_requires, tests_require and extras', () => {
    const root = project({
      'setup.cfg': [
        '[metadata]',
        'name = demo',
        '[options]',
        'install_requires =',
        '    marshmallow>=3',
        '    dataclasses-json',
        'tests_require = pytest',
        '[options.extras_require]',
        'dev =',
        '    flake8',
        'cli = click',
        '',
      ].join('\n'),
    });

    expect(readPythonDependencies(root)).toEqual({
      runtime: ['marshmallow', 'dataclasses-json', 'click'],
      development: ['pytest', 'flake8'],
    });
  });

  it('reads a Pipfile', () => {
    const root = project({
      Pipfile: '[packages]\nstructlog = "*"\n[dev-packages]\npytest = "*"\n',
    });

    expect(readPythonDependencies(root)).toEqual({
      runtime: ['structlog'],
      development: ['pytest'],
    });
  });

  it('counts a package that is both runtime and development as runtime', () => {
    const root = project({
      'requirements.txt': 'pydantic\n',
      'requirements-dev.txt': 'pydantic\npytest\n',
    });

    expect(readPythonDependencies(root)).toEqual({
      runtime: ['pydantic'],
      development: ['pytest'],
    });
  });

  it('reads nothing from a project without manifests, or with a broken one', () => {
    expect(readPythonDependencies(project({}))).toEqual({ runtime: [], development: [] });
    expect(readPythonDependencies(project({ 'pyproject.toml': '[project' }))).toEqual({
      runtime: [],
      development: [],
    });
  });
});
