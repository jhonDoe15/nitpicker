import { describe, expect, it } from 'vitest';
import { useProjects } from '../test-support/projects.mjs';
import { workflowParts } from './ci-steps.mjs';

const project = useProjects();
const PYTHON = { family: 'python', testRunner: 'pytest', typeChecker: 'mypy', tool: 'pip' };
const CHECKS = 'the python-rules, mutmut and dependency checks need Python 3.10 or newer';

function pythonSetup(files) {
  const root = project(files);
  const { ENVIRONMENT_STEPS, notes } = workflowParts(root, {
    project: PYTHON,
    peers: { missing: [], undeclared: [], installedOnly: [] },
    version: '1.2.3',
    repository: root,
  });
  return { setup: ENVIRONMENT_STEPS.slice(1).join('\n'), notes };
}

function pyproject(spec) {
  return { 'pyproject.toml': `[project]\nrequires-python = "${spec}"\n` };
}

describe('the Python version of the CI job', () => {
  it.each([
    ['a lower bound at the floor', pyproject('>=3.10'), '3.10'],
    ['a lower bound above the floor', pyproject('>=3.12,<4'), '3.12'],
    ['no bound', { 'pyproject.toml': '[tool.ruff]\n' }, '3.13'],
  ])('uses %s without a note', (_name, files, version) => {
    expect(pythonSetup(files)).toEqual({
      setup: `        with:\n          python-version: "${version}"`,
      notes: [],
    });
  });

  it.each([
    ['requires-python', pyproject('>=3.8'), '>=3.8'],
    ['an upper bound that keeps the floor', pyproject('>=3.8,<=3.10'), '>=3.8,<=3.10'],
    [
      'the poetry python',
      { 'pyproject.toml': '[tool.poetry.dependencies]\npython = "^3.9"\n' },
      '^3.9',
    ],
  ])('raises %s below the floor to Python 3.10, with a note', (_name, files, spec) => {
    const lower = /\d+\.\d+/u.exec(spec)[0];

    expect(pythonSetup(files)).toEqual({
      setup: '        with:\n          python-version: "3.10"',
      notes: [
        `pyproject.toml allows Python ${lower} ("${spec}"), and ${CHECKS}, so the CI job runs Python 3.10.`,
      ],
    });
  });

  it.each([
    ['a pinned version', pyproject('==3.9.*'), '==3.9.*'],
    ['an upper bound below the floor', pyproject('>=3.8,<3.10'), '>=3.8,<3.10'],
    [
      'a poetry tilde range',
      { 'pyproject.toml': '[tool.poetry.dependencies]\npython = "~3.9"\n' },
      '~3.9',
    ],
  ])('keeps the lower bound of %s that leaves the floor out, with a note', (_name, files, spec) => {
    const lower = /\d+\.\d+/u.exec(spec)[0];

    expect(pythonSetup(files)).toEqual({
      setup: `        with:\n          python-version: "${lower}"`,
      notes: [
        `pyproject.toml allows Python ${lower} ("${spec}"), and ${CHECKS}, which the range leaves out, so the CI job runs Python ${lower} and those checks report that they were skipped. Widen the range to run them.`,
      ],
    });
  });

  it('reads a .python-version at the floor without a note', () => {
    expect(pythonSetup({ '.python-version': '3.10.14\n', ...pyproject('>=3.8') })).toEqual({
      setup: '        with:\n          python-version-file: .python-version',
      notes: [],
    });
  });

  it('keeps a .python-version below the floor and notes what it skips', () => {
    expect(pythonSetup({ '.python-version': '3.9.18\n' })).toEqual({
      setup: '        with:\n          python-version-file: .python-version',
      notes: [
        `.python-version asks for Python 3.9, and ${CHECKS}, so in CI they report that they were skipped. Raise .python-version to 3.10 or newer to run them.`,
      ],
    });
  });
});
