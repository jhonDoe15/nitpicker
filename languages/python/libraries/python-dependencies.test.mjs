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

describe('requirements files', () => {
  it('skips constraints files, by name and as -c lines', () => {
    const root = project({
      'requirements.txt': 'attrs\n-c constraints.txt\n',
      'constraints.txt': 'pydantic==2.0\n',
      'requirements/constraints-dev.txt': 'msgspec\n',
      'requirements-constraints.txt': 'marshmallow\n',
    });

    expect(readPythonDependencies(root)).toEqual({ runtime: ['attrs'], development: [] });
  });

  it('follows -r includes of any project path, once, even in a loop', () => {
    const root = project({
      'requirements.txt':
        '-r deps/base.txt\n--requirement=deps/more.txt\n-rdeps/tight.txt\nloguru\n',
      'deps/base.txt': 'attrs\n-r ../requirements.txt\n-r more.txt\n',
      'deps/more.txt': 'structlog\n-r base.txt\n',
      'deps/tight.txt': 'cattrs\n',
      'requirements-dev.txt': '-r requirements.txt\npytest\n-r ../outside.txt\n-r missing.txt\n',
    });

    expect(readPythonDependencies(root)).toEqual({
      runtime: ['loguru', 'attrs', 'structlog', 'cattrs'],
      development: ['pytest'],
    });
  });

  it('does not follow an include out of the project', () => {
    const root = project({ 'requirements.txt': '-r ../../outside.txt\nattrs\n' });

    expect(readPythonDependencies(root)).toEqual({ runtime: ['attrs'], development: [] });
  });

  it('reads the .in file next to a compiled requirements file', () => {
    const root = project({
      'requirements.in': 'pydantic\n',
      'requirements.txt': 'annotated-types==0.6\npydantic==2.5\n    # via -r requirements.in\n',
    });

    expect(readPythonDependencies(root)).toEqual({ runtime: ['pydantic'], development: [] });
  });

  it('reads only the direct dependencies of a pip-compile output without a .in file', () => {
    const root = project({
      'requirements.txt': [
        '#',
        '# This file is autogenerated by pip-compile with Python 3.12',
        '#',
        'annotated-types==0.6.0',
        '    # via pydantic',
        'pydantic==2.5.0',
        '    # via -r requirements.in',
        'pydantic-core==2.14.0',
        '    # via pydantic',
        'typing-extensions==4.8.0',
        '    # via',
        '    #   pydantic',
        '    #   -r requirements.in',
        'structlog==23.1.0 \\',
        '    --hash=sha256:abc',
        '    # via -r requirements.in',
        '',
      ].join('\n'),
    });

    expect(readPythonDependencies(root)).toEqual({
      runtime: ['pydantic', 'typing-extensions', 'structlog'],
      development: [],
    });
  });

  it('keeps every entry of a compiled file that carries no annotations', () => {
    const root = project({
      'requirements.txt':
        '# This file is autogenerated by pip-compile\nattrs==23.1\ncattrs==23.2\n',
    });

    expect(readPythonDependencies(root)).toEqual({ runtime: ['attrs', 'cattrs'], development: [] });
  });

  it('reads inline via annotations', () => {
    const root = project({
      'requirements.txt': 'attrs==23.1  # via -r requirements.in\nsix==1.16  # via attrs\n',
    });

    expect(readPythonDependencies(root)).toEqual({ runtime: ['attrs'], development: [] });
  });

  it.each([
    [
      'a UTF-8 byte order mark',
      Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('attrs\nmsgspec\n')]),
    ],
    [
      'UTF-16 little endian',
      Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('attrs\r\nmsgspec\r\n', 'utf16le')]),
    ],
    [
      'UTF-16 big endian',
      Buffer.concat([
        Buffer.from([0xfe, 0xff]),
        Buffer.from('attrs\r\nmsgspec\r\n', 'utf16le').swap16(),
      ]),
    ],
    ['UTF-16 without a mark', Buffer.from('attrs\nmsgspec\n', 'utf16le')],
  ])('decodes %s', (_name, content) => {
    const root = project({ 'requirements.txt': content });

    expect(readPythonDependencies(root)).toEqual({
      runtime: ['attrs', 'msgspec'],
      development: [],
    });
  });
});

describe('setup.py', () => {
  it('reads literal install_requires, tests_require and extras_require', () => {
    const root = project({
      'setup.py': [
        'from setuptools import setup',
        'DEV = ["pytest"]',
        'setup(',
        '    name="demo",',
        '    install_requires=[',
        '        "marshmallow>=3",  # the "schema" library',
        '        # "unused",',
        "        'cerberus',",
        '    ],',
        '    tests_require=["mock"],',
        '    extras_require={',
        '        "dev": DEV + ["black"],',
        '        "cli": ["click>=8", "structlog"],',
        '        "docs": ["sphinx"],',
        '        "other": OTHER,',
        '    },',
        ')',
        '',
      ].join('\n'),
    });

    expect(readPythonDependencies(root)).toEqual({
      runtime: ['marshmallow', 'cerberus', 'click', 'structlog'],
      development: ['mock', 'sphinx'],
    });
  });

  it('ignores a requirement list that is not a literal', () => {
    const root = project({
      'setup.py': 'setup(install_requires=read_requirements(), extras_require=EXTRAS)\n',
    });

    expect(readPythonDependencies(root)).toEqual({ runtime: [], development: [] });
  });
});
