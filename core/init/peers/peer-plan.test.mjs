import { describe, expect, it } from 'vitest';
import { packageVersion } from '../../help/package-version.mjs';
import { useProjects } from '../test-support/projects.mjs';
import { installCommand, planPeers, pythonInstaller, shellQuoted } from './peer-plan.mjs';

const project = useProjects();
const MUTMUT = 'mutmut>=3,<4';
const NITPICKER = `nitpicker@${packageVersion()}`;
const NOTHING = { missing: [], undeclared: [], installedOnly: [] };

function nodeProject(add, testRunner = 'vitest') {
  return { family: 'node', packageManager: { add }, testRunner };
}

describe('peer plan for Node projects', () => {
  it.each([['npm install --save-dev'], ['pnpm add --save-dev -w'], ['yarn add --dev']])(
    'prints the install command %s with only the missing peers',
    (add) => {
      const root = project({
        'package.json': JSON.stringify({
          devDependencies: { typescript: '6', '@types/node': '25' },
        }),
      });

      expect(planPeers(root, nodeProject(add))).toEqual({
        ...NOTHING,
        missing: [NITPICKER, 'vitest', '@vitest/coverage-v8'],
        command: `${add} ${NITPICKER} vitest @vitest/coverage-v8`,
      });
    },
  );

  it('plans for the Jest packages of a Jest project', () => {
    const root = project({ 'package.json': '{}' });

    expect(planPeers(root, nodeProject('npm install --save-dev', 'jest')).command).toBe(
      `npm install --save-dev ${NITPICKER} 'typescript@^6' @types/node jest`,
    );
  });

  it('plans nothing when every peer is there', () => {
    const root = project({
      'package.json': JSON.stringify({
        devDependencies: { nitpicker: '1', typescript: '6', '@types/node': '25' },
      }),
    });

    expect(planPeers(root, nodeProject('npm install --save-dev', 'node'))).toEqual(NOTHING);
  });
});

describe('peer plan for Python projects', () => {
  const python = { family: 'python', testRunner: 'pytest', typeChecker: 'mypy' };
  const ALL = ['coverage', 'mypy', 'pytest', MUTMUT];

  it.each([
    ['uv', 'uv add --dev'],
    ['poetry', 'poetry add --group dev'],
    ['pipenv', 'pipenv install --dev'],
    ['pdm', 'pdm add -dG dev'],
    ['pip', 'python -m pip install'],
  ])('installs with the %s tool', (tool, installer) => {
    const root = project({ 'pyproject.toml': '' });

    expect(planPeers(root, { ...python, tool })).toEqual({
      missing: ALL,
      undeclared: ALL,
      installedOnly: [],
      command: `${installer} coverage mypy pytest 'mutmut>=3,<4'`,
      advice: undefined,
    });
  });

  it.each([
    [
      'hatch',
      'hatch run python -m pip install',
      'This installs them into the default hatch environment, which nitpicker uses. To keep them, list them in "dependencies" under [tool.hatch.envs.default].',
    ],
    [
      'conda',
      'conda install --channel conda-forge',
      "Run it with the project's conda environment active, or add the packages to environment.yml.",
    ],
  ])(
    'installs into the %s environment and says how to keep the peers',
    (tool, installer, advice) => {
      const plan = planPeers(project({ 'pyproject.toml': '' }), { ...python, tool });

      expect([plan.command, plan.advice]).toEqual([
        `${installer} coverage mypy pytest 'mutmut>=3,<4'`,
        advice,
      ]);
    },
  );

  it('counts a peer in .venv as present here but not for a fresh checkout', () => {
    const root = project({
      'requirements.txt': 'coverage\npytest\n',
      '.venv/lib/python3.13/site-packages/mypy/__init__.py': '',
      '.venv/lib/python3.13/site-packages/mutmut-3.2.0.dist-info/METADATA': '',
    });

    expect(planPeers(root, { ...python, tool: 'pip' })).toEqual({
      ...NOTHING,
      undeclared: ['mypy', MUTMUT],
      installedOnly: ['mypy', MUTMUT],
    });
  });

  it('plans nothing when the project declares every peer', () => {
    const root = project({ 'requirements.txt': 'coverage\nmypy\npytest\nmutmut\n' });

    expect(planPeers(root, { ...python, tool: 'pip' })).toEqual(NOTHING);
  });
});

describe('peer plan for Java and Kotlin projects', () => {
  it('asks for no package, only Java 21', () => {
    expect(planPeers(project({}), { family: 'jvm' })).toEqual({
      ...NOTHING,
      requirements: 'Java 21 or newer. nitpicker adds its own analysis tools to the build.',
    });
  });
});

describe('install commands', () => {
  it('quotes a requirement that holds shell characters only', () => {
    expect(shellQuoted('mutmut>=3,<4')).toBe("'mutmut>=3,<4'");
    expect(shellQuoted('@vitest/coverage-v8@4.1.11')).toBe('@vitest/coverage-v8@4.1.11');
    expect(shellQuoted('pytest-django')).toBe('pytest-django');
    expect(installCommand('uv add --dev', ['mypy', MUTMUT])).toBe(
      "uv add --dev mypy 'mutmut>=3,<4'",
    );
  });

  it('falls back to pip for a tool without an installer of its own', () => {
    expect(pythonInstaller('uv')).toBe('uv add --dev');
    expect(pythonInstaller('pip')).toBe('python -m pip install');
    expect(pythonInstaller('something-else')).toBe('python -m pip install');
  });
});
