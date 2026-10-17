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
  it('reads the distribution of a requirement line, a URL with #egg, and nothing from options', () => {
    expect(requirementName('Django>=4.2 ; python_version >= "3.10"  # web')).toBe('Django');
    expect(requirementName('requests[socks]==2.*')).toBe('requests');
    expect(requirementName('git+https://example.test/x.git#egg=my_lib')).toBe('my_lib');
    expect(requirementName('-r base.txt')).toBeUndefined();
    expect(requirementName('# comment')).toBeUndefined();
  });

  it.each([
    ['pydantic>=2,<3', 'pydantic'],
    ['Pydantic_Settings[extra]==2.1 ; python_version >= "3.9"', 'Pydantic_Settings'],
    ['attrs @ https://example.com/attrs.whl', 'attrs'],
    ['-e git+https://example.com/repo.git#egg=Local_Pkg', 'Local_Pkg'],
    ['git+https://example.com/repo.git@main&egg=other', 'other'],
    ['marshmallow # validation', 'marshmallow'],
    ['-e ./local', undefined],
    ['/srv/wheels/pkg.whl', undefined],
    ['--index-url https://example.com', undefined],
    ['https://example.com/pkg.whl', undefined],
    ['', undefined],
  ])('reads %s', (line, expected) => {
    expect(requirementName(line)).toBe(expected);
  });

  it('normalizes names the PEP 503 way and recognizes development groups', () => {
    expect(normalizeRequirementName('Zope.Interface__x')).toBe('zope-interface-x');
    expect(['dev', 'test-extras', 'lint', 'docs', 'typing', 'ci'].every(isDevelopmentGroup)).toBe(
      true,
    );
    expect(['web', 'postgres', 'devices', 'redis', 'all', 'latest'].some(isDevelopmentGroup)).toBe(
      false,
    );
  });
});

function names(root) {
  const { runtime, development } = readPythonDependencies(root);
  return { runtime, development };
}

function declaration({ runtime, development, complete, manifest }) {
  return { runtime, development, complete, manifest };
}

describe('the dependencies a project declares', () => {
  it('reads PEP 621, extras, dependency groups, uv and pdm from pyproject.toml', () => {
    const root = project({
      'pyproject.toml': [
        '[project]',
        'dependencies = ["attrs>=23", "Django"]',
        '[project.optional-dependencies]',
        'postgres = ["psycopg"]',
        'test = ["pytest"]',
        '[dependency-groups]',
        'lint = ["ruff"]',
        '[tool.uv]',
        'dev-dependencies = ["mypy"]',
        '[tool.pdm.dev-dependencies]',
        'docs = ["sphinx"]',
      ].join('\n'),
    });

    const result = readPythonDependencies(root);

    expect(result.runtime).toEqual(['attrs', 'django', 'psycopg']);
    expect(result.development).toEqual(['mypy', 'pytest', 'ruff', 'sphinx']);
    const { complete, declaresDev, manifest } = result;
    expect({ complete, declaresDev, manifest }).toEqual({
      complete: true,
      declaresDev: true,
      manifest: 'pyproject.toml',
    });
    expect(result.dependencies.find(({ normalized }) => normalized === 'psycopg')).toEqual({
      name: 'psycopg',
      normalized: 'psycopg',
      group: 'optional',
      file: 'pyproject.toml',
    });
  });
  it('reads Poetry dependencies and groups, leaving out python itself', () => {
    const root = project({
      'pyproject.toml': [
        '[tool.poetry.dependencies]',
        'python = "^3.11"',
        'fastapi = "*"',
        '[tool.poetry.group.test.dependencies]',
        'pytest = "*"',
        '[tool.poetry.dev-dependencies]',
        'black = "*"',
      ].join('\n'),
    });

    const { runtime, development, complete } = readPythonDependencies(root);
    expect({ runtime, development, complete }).toEqual({
      runtime: ['fastapi'],
      development: ['black', 'pytest'],
      complete: true,
    });
  });
  it('reads Pipfile categories', () => {
    const root = project({
      Pipfile:
        '[packages]\nrequests = "*"\n[dev-packages]\npytest = "*"\n[docs-packages]\nsphinx = "*"\n',
    });

    expect(declaration(readPythonDependencies(root))).toEqual({
      runtime: ['requests'],
      development: ['pytest', 'sphinx'],
      complete: true,
      manifest: 'Pipfile',
    });
  });
  it('reads requirements files by their name and setup.cfg options', () => {
    const root = project({
      'requirements.txt': 'flask>=2\n-r requirements/base.txt\n',
      'requirements/base.txt': 'click\n',
      'requirements-dev.txt': 'pytest\n',
      'setup.cfg':
        '[options]\ninstall_requires =\n    attrs\ntests_require = hypothesis\n[options.extras_require]\nlint = ruff\n',
    });

    expect(declaration(readPythonDependencies(root))).toEqual({
      runtime: ['attrs', 'click', 'flask'],
      development: ['hypothesis', 'pytest', 'ruff'],
      complete: true,
      manifest: 'setup.cfg',
    });
  });
  it('is incomplete when the dependencies are dynamic or only in setup.py', () => {
    expect(
      readPythonDependencies(
        project({ 'pyproject.toml': '[project]\ndynamic = ["dependencies"]\n' }),
      ).complete,
    ).toBe(false);
    expect(readPythonDependencies(project({ 'setup.py': 'setup()\n' })).complete).toBe(false);
    expect(readPythonDependencies(project({})).runtime).toEqual([]);
  });

  it('counts a package that is both runtime and development as runtime', () => {
    const root = project({
      'requirements.txt': 'pydantic\n',
      'requirements-dev.txt': 'pydantic\npytest\n',
    });

    expect(names(root)).toEqual({
      runtime: ['pydantic'],
      development: ['pytest'],
    });
  });

  it('reads Poetry main groups as runtime and a dependency group that includes another', () => {
    const root = project({
      'pyproject.toml': [
        '[tool.poetry.group.main.dependencies]',
        'structlog = "*"',
        '[dependency-groups]',
        'typing = [{ include-group = "lint" }, "pyright"]',
        '',
      ].join('\n'),
    });

    expect(names(root)).toEqual({
      runtime: ['structlog'],
      development: ['pyright'],
    });
  });

  it('reads requirements files named either way and a requirements directory', () => {
    const root = project({
      'requirements.txt': 'Cerberus==1.3\n# comment\nloguru>=0.7 ; sys_platform\n',
      'requirements-dev.txt': 'pytest\nvoluptuous\n',
      'dev-requirements.in': 'tox\n',
      'requirements/base.txt': 'attrs\ncattrs\n',
      'requirements/test.txt': 'hypothesis\n',
      'notes.txt': 'unrelated\n',
    });

    expect(names(root)).toEqual({
      runtime: ['attrs', 'cattrs', 'cerberus', 'loguru'],
      development: ['hypothesis', 'pytest', 'tox', 'voluptuous'],
    });
  });

  it('reads nothing from a manifest that cannot be parsed, and is incomplete', () => {
    const root = project({ 'pyproject.toml': '[project\n', Pipfile: '[packages\n' });

    expect(readPythonDependencies(root)).toEqual({
      runtime: [],
      development: [],
      dependencies: [],
      complete: false,
      declaresDev: false,
      manifest: 'pyproject.toml',
    });
  });

  it('reads nothing from a project without manifests', () => {
    expect(names(project({}))).toEqual({
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

    expect(names(root)).toEqual({ runtime: ['attrs'], development: [] });
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

    expect(names(root)).toEqual({
      runtime: ['attrs', 'cattrs', 'loguru', 'structlog'],
      development: ['pytest'],
    });
  });

  it('does not follow an include out of the project', () => {
    const root = project({ 'requirements.txt': '-r ../../outside.txt\nattrs\n' });

    expect(names(root)).toEqual({ runtime: ['attrs'], development: [] });
  });

  it('reads the .in file next to a compiled requirements file', () => {
    const root = project({
      'requirements.in': 'pydantic\n',
      'requirements.txt': 'annotated-types==0.6\npydantic==2.5\n    # via -r requirements.in\n',
    });

    expect(names(root)).toEqual({ runtime: ['pydantic'], development: [] });
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

    expect(names(root)).toEqual({
      runtime: ['pydantic', 'structlog', 'typing-extensions'],
      development: [],
    });
  });

  it('keeps every entry of a compiled file that carries no annotations', () => {
    const root = project({
      'requirements.txt':
        '# This file is autogenerated by pip-compile\nattrs==23.1\ncattrs==23.2\n',
    });

    expect(names(root)).toEqual({ runtime: ['attrs', 'cattrs'], development: [] });
  });

  it('reads inline via annotations', () => {
    const root = project({
      'requirements.txt': 'attrs==23.1  # via -r requirements.in\nsix==1.16  # via attrs\n',
    });

    expect(names(root)).toEqual({ runtime: ['attrs'], development: [] });
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

    expect(names(root)).toEqual({
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

    expect(names(root)).toEqual({
      runtime: ['cerberus', 'click', 'marshmallow', 'structlog'],
      development: ['mock', 'sphinx'],
    });
  });

  it('ignores a requirement list that is not a literal', () => {
    const root = project({
      'setup.py': 'setup(install_requires=read_requirements(), extras_require=EXTRAS)\n',
    });

    expect(names(root)).toEqual({ runtime: [], development: [] });
  });
});
