import { describe, expect, it } from 'vitest';
import { useProjects } from '../test-support/projects.mjs';
import { missingPythonPeers, requiredPythonPeers } from './python-peers.mjs';

const project = useProjects();
const MUTMUT = 'mutmut>=3,<4';

describe('required Python peers', () => {
  it.each([
    ['pytest', []],
    ['unittest', []],
    ['django', ['pytest-django']],
    ['nose2', ['nose2']],
  ])('adds what the %s runner needs', (testRunner, extra) => {
    expect(requiredPythonPeers({ testRunner, typeChecker: 'pyright' })).toEqual([
      'coverage',
      'pyright',
      'pytest',
      ...extra,
      MUTMUT,
    ]);
  });
});

describe('missing Python peers', () => {
  const python = { testRunner: 'pytest', typeChecker: 'mypy' };

  it('lists everything for a bare project', () => {
    expect(missingPythonPeers(project({ 'pyproject.toml': '' }), python)).toEqual([
      'coverage',
      'mypy',
      'pytest',
      MUTMUT,
    ]);
  });

  it('skips what pyproject.toml declares', () => {
    const root = project({
      'pyproject.toml':
        '[project]\ndependencies = ["flask"]\n[dependency-groups]\ndev = ["pytest>=8", "coverage[toml]", "mutmut==3.2.0"]\n',
    });

    expect(missingPythonPeers(root, python)).toEqual(['mypy']);
  });

  it('skips what requirements files and a Pipfile declare', () => {
    const root = project({
      'requirements-dev.txt': 'mypy==1.10\npytest\n',
      Pipfile: '[dev-packages]\ncoverage = "*"\nmutmut = "*"\n',
    });

    expect(missingPythonPeers(root, python)).toEqual([]);
  });

  it('does not take a tool table or a longer name for a declaration', () => {
    const root = project({
      'pyproject.toml': '[tool.mypy]\nstrict = true\n[tool.pytest.ini_options]\n',
      'requirements.txt': 'pytest-cov\ncoverage-badge\n',
    });

    expect(missingPythonPeers(root, python)).toEqual(['coverage', 'mypy', 'pytest', MUTMUT]);
  });

  it('treats dashes, dots and underscores alike', () => {
    const root = project({ 'requirements.txt': 'pytest_django\n' });

    expect(missingPythonPeers(root, { ...python, testRunner: 'django' })).toEqual([
      'coverage',
      'mypy',
      'pytest',
      MUTMUT,
    ]);
  });

  it('skips what the project virtualenv already holds', () => {
    const root = project({
      'pyproject.toml': '',
      '.venv/lib/python3.13/site-packages/coverage-7.0.dist-info/METADATA': '',
      '.venv/lib/python3.13/site-packages/mypy/__init__.py': '',
      '.venv/Lib/site-packages/pytest/__init__.py': '',
    });

    expect(missingPythonPeers(root, python)).toEqual([MUTMUT]);
  });

  it('asks for the type checker the project uses', () => {
    const root = project({ 'requirements.txt': 'coverage\npytest\nmutmut\n' });

    expect(missingPythonPeers(root, { ...python, typeChecker: 'basedpyright' })).toEqual([
      'basedpyright',
    ]);
  });
});
