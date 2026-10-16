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
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function project(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-python-dependencies-'));
  roots.push(root);
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), text);
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
  it('normalizes names the PEP 503 way and recognizes development groups', () => {
    expect(normalizeRequirementName('Zope.Interface__x')).toBe('zope-interface-x');
    expect(['dev', 'test', 'lint', 'docs', 'typing', 'ci'].every(isDevelopmentGroup)).toBe(true);
    expect(['web', 'postgres', 'devices'].some(isDevelopmentGroup)).toBe(false);
  });
});

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
    expect(result).toMatchObject({ complete: true, declaresDev: true, manifest: 'pyproject.toml' });
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

    expect(readPythonDependencies(root)).toMatchObject({
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

    expect(readPythonDependencies(root)).toMatchObject({
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

    expect(readPythonDependencies(root)).toMatchObject({
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
});
