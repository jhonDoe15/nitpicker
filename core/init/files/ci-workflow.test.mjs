import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import { PACKAGE_MANAGERS } from '../detection/package-manager.mjs';
import { readText, useProjects } from '../test-support/projects.mjs';
import { unifiedDiff } from './line-diff.mjs';
import { placeWorkflow, renderWorkflow, WORKFLOW_PATH } from './ci-workflow.mjs';

const project = useProjects();
const VERSION = '1.2.3';

function nodeContext(name) {
  return {
    project: { family: 'node', packageManager: PACKAGE_MANAGERS[name] },
    missing: [],
    version: VERSION,
  };
}

function pythonContext(tool, missing = []) {
  return { project: { family: 'python', tool }, missing, version: VERSION };
}

function stepsOf(text) {
  return parse(text).jobs.nitpicker.steps.map((entry) => entry.uses ?? entry.run);
}

function render(root, context, repository = root) {
  return renderWorkflow(root, context, repository);
}

describe('workflow for Node projects', () => {
  it('checks out the whole history and runs nitpicker on pull requests with Node 24', () => {
    const root = project({ 'package.json': '{}', 'package-lock.json': '{}' });
    const workflow = parse(render(root, nodeContext('npm')));

    expect(workflow.on).toEqual({ pull_request: null });
    expect(workflow.permissions).toEqual({ contents: 'read' });
    expect(workflow.jobs.nitpicker['runs-on']).toBe('ubuntu-latest');
    expect(workflow.jobs.nitpicker.steps.slice(0, 2)).toEqual([
      { uses: 'actions/checkout@v4', with: { 'fetch-depth': 0 } },
      { uses: 'actions/setup-node@v4', with: { 'node-version': 24 } },
    ]);
  });

  it('installs and runs with npm', () => {
    const root = project({ 'package.json': '{}', 'package-lock.json': '{}' });

    expect(stepsOf(render(root, nodeContext('npm'))).slice(2)).toEqual(['npm ci', 'npx nitpicker']);
  });

  it('falls back to npm install without a lockfile', () => {
    const root = project({ 'package.json': '{}' });

    expect(stepsOf(render(root, nodeContext('npm'))).slice(2)).toEqual([
      'npm install',
      'npx nitpicker',
    ]);
  });

  it('sets pnpm up at the version of packageManager, or 10 without one', () => {
    const declared = project({ 'package.json': '{"packageManager":"pnpm@9.1.0"}' });
    const bare = project({ 'package.json': '{}' });

    expect(parse(render(declared, nodeContext('pnpm'))).jobs.nitpicker.steps[2]).toEqual({
      uses: 'pnpm/action-setup@v4',
    });
    expect(parse(render(bare, nodeContext('pnpm'))).jobs.nitpicker.steps[2]).toEqual({
      uses: 'pnpm/action-setup@v4',
      with: { version: 10 },
    });
    expect(stepsOf(render(bare, nodeContext('pnpm'))).slice(2)).toEqual([
      'pnpm/action-setup@v4',
      'pnpm install --frozen-lockfile',
      'pnpm exec nitpicker',
    ]);
  });

  it('installs frozen with Yarn classic and Yarn Berry', () => {
    const classic = project({ 'package.json': '{}' });
    const berry = project({ 'package.json': '{}', '.yarnrc.yml': 'nodeLinker: node-modules\n' });

    expect(stepsOf(render(classic, nodeContext('yarn'))).slice(2)).toEqual([
      'yarn install --frozen-lockfile',
      'yarn nitpicker',
    ]);
    expect(stepsOf(render(berry, nodeContext('yarn'))).slice(2)).toEqual([
      'yarn install --immutable',
      'yarn nitpicker',
    ]);
  });

  it('sets Bun up, installs frozen and runs with bunx', () => {
    const root = project({ 'package.json': '{}' });

    expect(stepsOf(render(root, nodeContext('bun'))).slice(2)).toEqual([
      'oven-sh/setup-bun@v2',
      'bun install --frozen-lockfile',
      'bunx nitpicker',
    ]);
  });

  it('runs the pinned package when there is no package.json to install from', () => {
    const root = project({ 'src/index.js': '' });

    expect(stepsOf(render(root, nodeContext('npm'))).slice(2)).toEqual(['npx nitpicker@1.2.3']);
  });
});

describe('workflow for Python projects', () => {
  const pythonSetup = {
    uses: 'actions/setup-python@v5',
    with: { 'python-version': '3.13' },
  };

  it('sets Python up and runs the pinned package', () => {
    const root = project({ 'pyproject.toml': '' });
    const steps = parse(render(root, pythonContext('path'))).jobs.nitpicker.steps;

    expect(steps[2]).toEqual(pythonSetup);
    expect(steps.at(-1)).toEqual({ name: 'nitpicker', run: 'npx nitpicker@1.2.3' });
  });

  it.each([
    ['uv', ['actions/setup-python@v5', 'astral-sh/setup-uv@v5', 'uv sync']],
    ['poetry', ['actions/setup-python@v5', 'pipx install poetry', 'poetry install']],
    ['pipenv', ['actions/setup-python@v5', 'pipx install pipenv', 'pipenv install --dev']],
    ['pdm', ['actions/setup-python@v5', 'pipx install pdm', 'pdm install']],
  ])('syncs a %s project with its own tool', (tool, expected) => {
    const root = project({ 'pyproject.toml': '' });

    expect(stepsOf(render(root, pythonContext(tool))).slice(2, -1)).toEqual(expected);
  });

  it('installs requirements.txt and the missing peers for a pip project', () => {
    const root = project({ 'requirements.txt': 'flask\n' });
    const context = pythonContext('path', ['coverage', 'mutmut>=3,<4']);

    expect(stepsOf(render(root, context)).slice(3, -1)).toEqual([
      'python -m pip install -r requirements.txt',
      "python -m pip install coverage 'mutmut>=3,<4'",
    ]);
  });

  it('installs the package itself for a pyproject pip project with every peer declared', () => {
    const root = project({ 'pyproject.toml': '' });

    expect(stepsOf(render(root, pythonContext('venv'))).slice(3, -1)).toEqual([
      'python -m pip install -e .',
    ]);
  });
});

describe('workflow for Java and Kotlin projects', () => {
  it.each(['java', 'kotlin'])('sets Java 21 up for a %s project', () => {
    const root = project({ 'build.gradle': '' });
    const context = { project: { family: 'jvm' }, missing: [], version: VERSION };
    const steps = parse(render(root, context)).jobs.nitpicker.steps;

    expect(steps.slice(2)).toEqual([
      { uses: 'actions/setup-java@v4', with: { distribution: 'temurin', 'java-version': 21 } },
      { name: 'nitpicker', run: 'npx nitpicker@1.2.3' },
    ]);
  });
});

describe('workflow location', () => {
  it('runs in the project folder when the project is below the repository root', () => {
    const root = project({ 'web/package.json': '{}' }, { repository: true });
    const workflow = parse(render(`${root}/web`, nodeContext('npm'), root));

    expect(workflow.jobs.nitpicker.defaults).toEqual({ run: { 'working-directory': 'web' } });
  });

  it('adds no defaults at the repository root', () => {
    const root = project({ 'package.json': '{}' });

    expect(parse(render(root, nodeContext('npm'))).jobs.nitpicker.defaults).toBeUndefined();
  });

  it('writes the workflow at the repository root', () => {
    const root = project({ 'web/package.json': '{}' }, { repository: true });

    expect(placeWorkflow(`${root}/web`, nodeContext('npm'))).toEqual({
      relative: WORKFLOW_PATH,
      status: 'created',
    });
    expect(parse(readText(root, WORKFLOW_PATH)).jobs.nitpicker.defaults.run).toEqual({
      'working-directory': 'web',
    });
  });

  it('writes next to the project outside a repository', () => {
    const root = project({ 'package.json': '{}' });

    expect(placeWorkflow(root, nodeContext('npm')).status).toBe('created');
    expect(readText(root, WORKFLOW_PATH)).toBe(render(root, nodeContext('npm')));
  });

  it('is unchanged when the same workflow is already there', () => {
    const root = project({ 'package.json': '{}' }, { repository: true });
    placeWorkflow(root, nodeContext('npm'));

    expect(placeWorkflow(root, nodeContext('npm')).status).toBe('unchanged');
  });

  it('never overwrites a workflow of the same name, and returns the diff', () => {
    const existing = 'name: nitpicker\non: push\n';
    const root = project({ [WORKFLOW_PATH]: existing }, { repository: true });
    const result = placeWorkflow(root, nodeContext('npm'));

    expect(result).toEqual({
      relative: WORKFLOW_PATH,
      status: 'differs',
      diff: unifiedDiff({
        name: WORKFLOW_PATH,
        before: existing,
        after: render(root, nodeContext('npm')),
      }),
    });
    expect(readText(root, WORKFLOW_PATH)).toBe(existing);
  });
});
