import { describe, expect, it } from 'vitest';
import { PACKAGE_MANAGERS } from '../detection/package-manager.mjs';
import { useProjects } from '../test-support/projects.mjs';
import { planPeers, pythonInstaller, shellQuoted } from './peer-plan.mjs';

const project = useProjects();

function nodeProject(name, testRunner = 'vitest') {
  return { family: 'node', packageManager: PACKAGE_MANAGERS[name], testRunner };
}

describe('peer plan for Node projects', () => {
  it.each([
    ['npm', 'npm install --save-dev'],
    ['pnpm', 'pnpm add --save-dev'],
    ['yarn', 'yarn add --dev'],
    ['bun', 'bun add --dev'],
  ])('prints the %s install command with only the missing peers', (name, add) => {
    const root = project({
      'package.json': JSON.stringify({ devDependencies: { typescript: '6', '@types/node': '25' } }),
    });

    expect(planPeers(root, nodeProject(name))).toEqual({
      missing: ['nitpicker', 'vitest', '@vitest/coverage-v8'],
      command: `${add} nitpicker vitest @vitest/coverage-v8`,
    });
  });

  it('plans for the Jest packages of a Jest project', () => {
    const root = project({ 'package.json': '{}' });

    expect(planPeers(root, nodeProject('npm', 'jest')).command).toBe(
      'npm install --save-dev nitpicker typescript @types/node jest',
    );
  });

  it('plans nothing when every peer is there', () => {
    const root = project({
      'package.json': JSON.stringify({
        devDependencies: { nitpicker: '1', typescript: '6', '@types/node': '25' },
      }),
    });

    expect(planPeers(root, nodeProject('npm', 'node'))).toEqual({ missing: [] });
  });
});

describe('peer plan for Python projects', () => {
  const python = { family: 'python', testRunner: 'pytest', typeChecker: 'mypy' };

  it.each([
    ['uv', 'uv add --dev'],
    ['poetry', 'poetry add --group dev'],
    ['pipenv', 'pipenv install --dev'],
    ['pdm', 'pdm add -dG dev'],
    ['path', 'python -m pip install'],
    ['venv', 'python -m pip install'],
    ['hatch', 'python -m pip install'],
    ['conda', 'python -m pip install'],
  ])('installs with the %s tool', (tool, installer) => {
    const root = project({ 'pyproject.toml': '' });

    expect(planPeers(root, { ...python, tool })).toEqual({
      missing: ['coverage', 'mypy', 'pytest', 'mutmut>=3,<4'],
      command: `${installer} coverage mypy pytest 'mutmut>=3,<4'`,
    });
  });

  it('plans nothing when the project declares every peer', () => {
    const root = project({ 'requirements.txt': 'coverage\nmypy\npytest\nmutmut\n' });

    expect(planPeers(root, { ...python, tool: 'path' })).toEqual({ missing: [] });
  });
});

describe('peer plan for Java and Kotlin projects', () => {
  it('asks for no package, only Java 21', () => {
    expect(planPeers(project({}), { family: 'jvm' })).toEqual({
      missing: [],
      requirements: 'Java 21 or newer. nitpicker adds its own analysis tools to the build.',
    });
  });
});

describe('shell quoting', () => {
  it('quotes a requirement that holds shell characters only', () => {
    expect(shellQuoted('mutmut>=3,<4')).toBe("'mutmut>=3,<4'");
    expect(shellQuoted('@vitest/coverage-v8@4.1.11')).toBe('@vitest/coverage-v8@4.1.11');
    expect(shellQuoted('pytest-django')).toBe('pytest-django');
  });

  it('falls back to pip for a tool without an installer of its own', () => {
    expect(pythonInstaller('uv')).toBe('uv add --dev');
    expect(pythonInstaller('something-else')).toBe('python -m pip install');
  });
});
