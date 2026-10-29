import { symlinkSync } from 'node:fs';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import { describePackageManager } from '../detection/package-manager.mjs';
import { readText, useProjects } from '../test-support/projects.mjs';
import { unifiedDiff } from './line-diff.mjs';
import { placeWorkflow, renderWorkflow, workflowPath } from './ci-workflow.mjs';

const project = useProjects();
const VERSION = '1.2.3';
const ROOT_WORKFLOW = '.github/workflows/nitpicker.yml';
const NO_PEERS = { missing: [], undeclared: [], installedOnly: [] };
const PYTHON = { family: 'python', testRunner: 'pytest', typeChecker: 'mypy' };
const PYTHON_PEERS = "coverage mypy pytest 'mutmut>=3,<4'";
const ALL_PYTHON_PEERS = `python -m pip install ${PYTHON_PEERS}`;

function nodeContext(root, repository = root) {
  return {
    project: { family: 'node', packageManager: describePackageManager(root) },
    peers: NO_PEERS,
    version: VERSION,
    repository,
  };
}

function pythonContext(root, tool, undeclared = []) {
  return {
    project: { ...PYTHON, tool },
    peers: { ...NO_PEERS, undeclared },
    version: VERSION,
    repository: root,
  };
}

function stepsOf(text) {
  return parse(text).jobs.nitpicker.steps.map((entry) => entry.uses ?? entry.run);
}

function nodeSteps(files, options) {
  const root = project(files, options);
  return stepsOf(renderWorkflow(root, nodeContext(root))).slice(2);
}

describe('workflow for Node projects', () => {
  it('checks out the whole history and runs nitpicker on pull requests with Node 24', () => {
    const root = project({ 'package.json': '{}', 'package-lock.json': '{}' });
    const workflow = parse(renderWorkflow(root, nodeContext(root)));

    expect(workflow.name).toBe('nitpicker');
    expect(workflow.on).toEqual({ pull_request: null });
    expect(workflow.permissions).toEqual({ contents: 'read' });
    expect(workflow.jobs.nitpicker['runs-on']).toBe('ubuntu-latest');
    expect(workflow.jobs.nitpicker.steps.slice(0, 2)).toEqual([
      { uses: 'actions/checkout@v4', with: { 'fetch-depth': 0 } },
      { uses: 'actions/setup-node@v4', with: { 'node-version': 24 } },
    ]);
  });

  it.each([
    ['npm', { 'package-lock.json': '{}' }, ['npm ci', 'npx nitpicker']],
    ['npm', {}, ['npm install', 'npx nitpicker']],
    ['Yarn 1', { 'yarn.lock': '' }, ['yarn install --frozen-lockfile', 'yarn nitpicker']],
    [
      'Bun',
      { 'bun.lock': '' },
      ['oven-sh/setup-bun@v2', 'bun install --frozen-lockfile', 'bunx nitpicker'],
    ],
  ])(
    'installs frozen from the lockfile of %s, and plainly without one',
    (_name, lockfile, expected) => {
      expect(nodeSteps({ 'package.json': '{}', ...lockfile })).toEqual(expected);
    },
  );

  it('installs plainly with every manager when there is no lockfile', () => {
    const declared = (field) => ({ 'package.json': JSON.stringify({ packageManager: field }) });

    expect(nodeSteps(declared('pnpm@9.1.0')).slice(-2)).toEqual([
      'pnpm install',
      'pnpm exec nitpicker',
    ]);
    expect(nodeSteps(declared('yarn@1.22.22')).slice(-2)).toEqual([
      'yarn install',
      'yarn nitpicker',
    ]);
    const berry = { ...declared('yarn@4.5.0'), '.yarnrc.yml': 'nodeLinker: node-modules\n' };

    expect(nodeSteps(berry).slice(-2)).toEqual(['yarn install --no-immutable', 'yarn nitpicker']);
    expect(nodeSteps(declared('bun@1.1.0')).slice(-2)).toEqual(['bun install', 'bunx nitpicker']);
  });

  it('enables corepack and installs immutably for Yarn 2 or newer', () => {
    const files = {
      'package.json': '{}',
      '.yarnrc.yml': 'nodeLinker: node-modules\n',
      'yarn.lock': '',
    };

    expect(nodeSteps(files)).toEqual([
      'corepack enable',
      'yarn install --immutable',
      'yarn nitpicker',
    ]);
  });

  it('enables corepack for a project that declares packageManager', () => {
    const files = { 'package.json': '{"packageManager":"npm@10.9.0"}', 'package-lock.json': '{}' };

    expect(nodeSteps(files)).toEqual(['corepack enable', 'npm ci', 'npx nitpicker']);
  });

  it('lets pnpm/action-setup read the declaring package.json at the repository root', () => {
    const files = { 'package.json': '{"packageManager":"pnpm@9.1.0"}', 'pnpm-lock.yaml': '' };
    const root = project(files, { repository: true });

    expect(parse(renderWorkflow(root, nodeContext(root))).jobs.nitpicker.steps.slice(2)).toEqual([
      { run: 'corepack enable' },
      { uses: 'pnpm/action-setup@v4' },
      { run: 'pnpm install --frozen-lockfile' },
      { name: 'nitpicker', run: 'pnpm exec nitpicker' },
    ]);
  });

  it('points pnpm/action-setup at a declaring package.json below the repository root', () => {
    const files = { 'apps/web/package.json': '{"packageManager":"pnpm@9.1.0"}' };
    const root = project(files, { repository: true });
    const web = `${root}/apps/web`;
    const steps = parse(renderWorkflow(web, nodeContext(web, root))).jobs.nitpicker.steps;

    expect(steps[3]).toEqual({
      uses: 'pnpm/action-setup@v4',
      with: { package_json_file: 'apps/web/package.json' },
    });
  });

  it.each([
    ["lockfileVersion: '9.0'\n", 10],
    ["lockfileVersion: '6.0'\n", 8],
    ['lockfileVersion: 5.4\n', 7],
    ['', 10],
  ])('sets up the pnpm major of the lockfile %j without a declaration', (lockfile, major) => {
    const root = project({ 'package.json': '{}', 'pnpm-lock.yaml': lockfile });

    expect(parse(renderWorkflow(root, nodeContext(root))).jobs.nitpicker.steps[2]).toEqual({
      uses: 'pnpm/action-setup@v4',
      with: { version: major },
    });
  });

  it('runs the pinned package when there is no package.json to install from', () => {
    expect(nodeSteps({ 'src/index.js': '' })).toEqual(['npx nitpicker@1.2.3']);
  });
});

describe('workflow for Python projects', () => {
  const pythonSetup = {
    uses: 'actions/setup-python@v5',
    with: { 'python-version': '3.13' },
  };

  function pythonSteps(files, tool, undeclared) {
    const root = project(files);
    return stepsOf(renderWorkflow(root, pythonContext(root, tool, undeclared))).slice(2, -1);
  }

  it('sets Python up and runs the pinned package', () => {
    const root = project({ 'pyproject.toml': '' });
    const steps = parse(renderWorkflow(root, pythonContext(root, 'pip'))).jobs.nitpicker.steps;

    expect(steps[2]).toEqual(pythonSetup);
    expect(steps.at(-1)).toEqual({ name: 'nitpicker', run: 'npx nitpicker@1.2.3' });
  });

  it.each([
    ['uv', ['astral-sh/setup-uv@v5', 'uv sync'], 'uv pip install'],
    ['poetry', ['pipx install poetry', 'poetry install'], 'poetry run python -m pip install'],
    ['pipenv', ['pipx install pipenv', 'pipenv install --dev'], 'pipenv run python -m pip install'],
    ['pdm', ['pipx install pdm', 'pdm install'], 'pdm run python -m pip install'],
    ['hatch', ['pipx install hatch', 'hatch env create'], 'hatch run python -m pip install'],
  ])(
    'syncs a %s project with its own tool, then installs every peer into it',
    (tool, sync, install) => {
      expect(pythonSteps({ 'pyproject.toml': '' }, tool)).toEqual([
        'actions/setup-python@v5',
        ...sync,
        `${install} ${PYTHON_PEERS}`,
      ]);
    },
  );

  it.each([['uv'], ['hatch'], ['pip']])(
    'writes the same %s workflow before and after the project declares its peers',
    (tool) => {
      const root = project({ 'pyproject.toml': '' });

      expect(renderWorkflow(root, pythonContext(root, tool, ['mypy', 'mutmut>=3,<4']))).toBe(
        renderWorkflow(root, pythonContext(root, tool)),
      );
    },
  );

  it.each([
    [
      '.python-version',
      { '.python-version': '3.12\n' },
      { 'python-version-file': '.python-version' },
    ],
    [
      'requires-python',
      { 'pyproject.toml': '[project]\nrequires-python = ">=3.11,<4"\n' },
      { 'python-version': '3.11' },
    ],
    [
      'the poetry python',
      { 'pyproject.toml': '[tool.poetry.dependencies]\npython = "^3.10"\n' },
      { 'python-version': '3.10' },
    ],
    ['nothing', { 'pyproject.toml': '[tool.ruff]\n' }, { 'python-version': '3.13' }],
  ])('sets the Python version from %s', (_name, files, settings) => {
    const root = project(files);

    expect(parse(renderWorkflow(root, pythonContext(root, 'pip'))).jobs.nitpicker.steps[2]).toEqual(
      {
        uses: 'actions/setup-python@v5',
        with: settings,
      },
    );
  });

  it.each([['pip'], ['conda']])(
    'installs the project and every peer with pip for %s without an environment.yml',
    (tool) => {
      const files = {
        'requirements.txt': 'flask\n',
        'requirements-dev.txt': 'pytest\n',
        'pyproject.toml': '[project]\nname = "demo"\n',
      };

      expect(pythonSteps(files, tool).slice(1)).toEqual([
        'python -m pip install -r requirements-dev.txt',
        'python -m pip install -r requirements.txt',
        'python -m pip install -e .',
        ALL_PYTHON_PEERS,
      ]);
    },
  );

  it('creates the environment of a conda project with setup-miniconda and installs every peer into it', () => {
    const root = project(
      { 'api/environment.yml': 'name: shop-api\ndependencies:\n  - pytest\n' },
      { repository: true },
    );
    const context = pythonContext(root, 'conda', ['mypy']);
    const job = parse(renderWorkflow(`${root}/api`, context)).jobs.nitpicker;

    expect(job.defaults).toEqual({ run: { 'working-directory': 'api', shell: 'bash -el {0}' } });
    expect(job.steps.slice(2)).toEqual([
      {
        uses: 'conda-incubator/setup-miniconda@v3',
        with: {
          'environment-file': 'api/environment.yml',
          'activate-environment': 'shop-api',
          'auto-activate-base': false,
        },
      },
      { run: `conda install --yes --channel conda-forge ${PYTHON_PEERS}` },
      { name: 'nitpicker', run: 'npx nitpicker@1.2.3' },
    ]);
  });

  it('names the conda environment itself when environment.yml has no name', () => {
    const root = project({ 'environment.yaml': 'dependencies:\n  - python\n' });
    const job = parse(renderWorkflow(root, pythonContext(root, 'conda'))).jobs.nitpicker;

    expect(job.defaults).toEqual({ run: { shell: 'bash -el {0}' } });
    expect(job.steps[2].with).toEqual({
      'environment-file': 'environment.yaml',
      'activate-environment': 'nitpicker',
      'auto-activate-base': false,
    });
    expect(job.steps.slice(3)).toEqual([
      { run: `conda install --yes --channel conda-forge ${PYTHON_PEERS}` },
      { name: 'nitpicker', run: 'npx nitpicker@1.2.3' },
    ]);
  });

  it('does not install a pyproject.toml that only configures tools', () => {
    expect(pythonSteps({ 'pyproject.toml': '[tool.ruff]\n' }, 'pip').slice(1)).toEqual([
      ALL_PYTHON_PEERS,
    ]);
  });
});

describe('workflow for Java and Kotlin projects', () => {
  it('sets Java 21 up', () => {
    const root = project({ 'build.gradle': '' });
    const context = {
      project: { family: 'jvm' },
      peers: NO_PEERS,
      version: VERSION,
      repository: root,
    };

    expect(parse(renderWorkflow(root, context)).jobs.nitpicker.steps.slice(2)).toEqual([
      { uses: 'actions/setup-java@v4', with: { distribution: 'temurin', 'java-version': 21 } },
      { name: 'nitpicker', run: 'npx nitpicker@1.2.3' },
    ]);
  });
});

describe('workflow location', () => {
  it('names the workflow after a project below the repository root', () => {
    expect(workflowPath('/repo', '/repo')).toBe(ROOT_WORKFLOW);
    expect(workflowPath('/repo/apps/web', '/repo')).toBe(
      '.github/workflows/nitpicker-apps--web.yml',
    );
    expect(workflowPath('/repo/apps/Web App', '/repo')).toBe(
      '.github/workflows/nitpicker-apps--web-app-60d39972.yml',
    );
  });

  it.each([
    ['a-b', 'a/b', 'nitpicker-a-b.yml', 'nitpicker-a--b.yml'],
    ['my_app', 'My_App', 'nitpicker-my_app.yml', 'nitpicker-my-app-0e86b84b.yml'],
    ['a-b', 'a b', 'nitpicker-a-b.yml', 'nitpicker-a-b-c8687a08.yml'],
  ])('gives %s and %s different workflow files', (first, second, firstFile, secondFile) => {
    expect([
      workflowPath(`/repo/${first}`, '/repo'),
      workflowPath(`/repo/${second}`, '/repo'),
    ]).toEqual([`.github/workflows/${firstFile}`, `.github/workflows/${secondFile}`]);
  });

  it('runs in the project folder, quoted, when the project is below the repository root', () => {
    const root = project({ 'my app #2/package.json': '{}' }, { repository: true });
    const text = renderWorkflow(`${root}/my app #2`, nodeContext(`${root}/my app #2`, root));

    expect(text.split('\n').slice(0, 1)).toEqual(['name: "nitpicker (my app #2)"']);
    expect(parse(text).jobs.nitpicker.defaults).toEqual({
      run: { 'working-directory': 'my app #2' },
    });
  });

  it('adds no defaults at the repository root', () => {
    const root = project({ 'package.json': '{}' });

    expect(parse(renderWorkflow(root, nodeContext(root))).jobs.nitpicker.defaults).toBeUndefined();
  });

  it('writes one workflow per project at the repository root', () => {
    const root = project(
      { 'web/package.json': '{}', 'api/package.json': '{}' },
      { repository: true },
    );

    expect(placeWorkflow(`${root}/web`, nodeContext(`${root}/web`, root))).toEqual({
      relative: '.github/workflows/nitpicker-web.yml',
      status: 'created',
    });
    expect(placeWorkflow(`${root}/api`, nodeContext(`${root}/api`, root)).status).toBe('created');
    expect(
      parse(readText(root, '.github/workflows/nitpicker-web.yml')).jobs.nitpicker.defaults,
    ).toEqual({
      run: { 'working-directory': 'web' },
    });
  });

  it.each([
    ['Unix line endings', (text) => text],
    ['Windows line endings', (text) => text.replaceAll('\n', '\r\n')],
    ['no final newline', (text) => text.trimEnd()],
  ])('is unchanged when the same workflow is already there with %s', (_name, written) => {
    const sample = project({ 'package.json': '{}' });
    const content = written(renderWorkflow(sample, nodeContext(sample)));
    const root = project({ 'package.json': '{}', [ROOT_WORKFLOW]: content }, { repository: true });

    expect(placeWorkflow(root, nodeContext(root))).toEqual({
      relative: ROOT_WORKFLOW,
      status: 'unchanged',
    });
  });

  it('never overwrites a workflow of the same name, and returns the diff', () => {
    const existing = 'name: nitpicker\non: push\n';
    const root = project({ [ROOT_WORKFLOW]: existing }, { repository: true });

    expect(placeWorkflow(root, nodeContext(root))).toEqual({
      relative: ROOT_WORKFLOW,
      status: 'differs',
      reason: 'It differs from what init would write.',
      diff: unifiedDiff({
        name: ROOT_WORKFLOW,
        before: existing,
        after: renderWorkflow(root, nodeContext(root)),
      }),
    });
    expect(readText(root, ROOT_WORKFLOW)).toBe(existing);
  });

  it('refuses to write through a .github folder that links outside the repository', () => {
    const root = project({}, { repository: true });
    const outside = project({ 'workflows/keep.txt': '' });
    symlinkSync(outside, `${root}/.github`);

    expect(() => placeWorkflow(root, nodeContext(root))).toThrow(
      `${ROOT_WORKFLOW} resolves through a symbolic link to ${outside}/workflows/nitpicker.yml, outside ${root}, so nitpicker init does not write through it. Replace the link with a file, or make the change by hand.`,
    );
  });
});
