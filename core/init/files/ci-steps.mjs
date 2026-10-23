import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { hasProjectFile, insideProject } from '../support/inside-project.mjs';
import { installCommand, pythonInstaller } from '../peers/peer-plan.mjs';
import { requiredPythonPeers } from '../peers/python-peers.mjs';

const STEP = '      - ';
const DETAIL = '        ';
const DEFAULT_PNPM = 10;
const PNPM_BY_LOCKFILE = [
  ['9.', 10],
  ['6.', 8],
  ['5.4', 7],
  ['5.3', 6],
];
const LOCKFILE_VERSION = /^lockfileVersion:\s*['"]?(?<version>[\d.]+)/mu;
const PYTHON_VERSION = '3.13';
const JAVA_VERSION = 21;
const PLAIN_SCALAR = /^[A-Za-z_/.][\w@/.=,' <>+-]*$/u;
const BUILDABLE_PYPROJECT = /^\s*\[(?:project|build-system)\]/mu;
const REQUIREMENTS_FILE = /^requirements[\w.-]*\.txt$/u;
const PIP_INSTALL = 'python -m pip install';
const PYTHON_SYNC = {
  uv: ['uv sync'],
  poetry: ['pipx install poetry', 'poetry install'],
  pipenv: ['pipx install pipenv', 'pipenv install --dev'],
  pdm: ['pipx install pdm', 'pdm install'],
  hatch: ['pipx install hatch', 'hatch env create'],
};

export function yamlScalar(value) {
  return typeof value === 'string' && !PLAIN_SCALAR.test(value) ? JSON.stringify(value) : value;
}

function step(uses, settings = {}) {
  const entries = Object.entries(settings);
  return [
    `${STEP}uses: ${uses}`,
    ...(entries.length === 0 ? [] : [`${DETAIL}with:`]),
    ...entries.map(([key, value]) => `${DETAIL}  ${key}: ${String(yamlScalar(value))}`),
  ];
}

function run(command) {
  return [`${STEP}run: ${String(yamlScalar(command))}`];
}

function repositoryPath(repository, file) {
  return path.relative(repository, file).split(path.sep).join('/');
}

function lockedPnpmMajor(manager) {
  const lockfile = insideProject(manager.root, 'pnpm-lock.yaml');
  const version = manager.locked
    ? LOCKFILE_VERSION.exec(readFileSync(lockfile, 'utf8'))?.groups.version
    : undefined;
  return PNPM_BY_LOCKFILE.find(([prefix]) => version?.startsWith(prefix))?.[1] ?? DEFAULT_PNPM;
}

function pnpmSetup(manager, repository) {
  const declaration = manager.declaration;
  if (!String(declaration?.field).startsWith('pnpm@')) {
    return step('pnpm/action-setup@v4', { version: lockedPnpmMajor(manager) });
  }
  const file = repositoryPath(repository, insideProject(declaration.directory, 'package.json'));
  return step('pnpm/action-setup@v4', file === 'package.json' ? {} : { package_json_file: file });
}

function isBerry(manager) {
  return manager.name === 'yarn' && manager.major > 1;
}

function nodeEnvironment(manager, repository) {
  const corepack = manager.declaration !== undefined || isBerry(manager);
  const tool = {
    pnpm: () => pnpmSetup(manager, repository),
    bun: () => step('oven-sh/setup-bun@v2'),
  }[manager.name];
  return [...(corepack ? run('corepack enable') : []), ...(tool?.() ?? [])];
}

function nodeInstallCommand(manager) {
  const [locked, unlocked] = {
    npm: ['npm ci', 'npm install'],
    pnpm: ['pnpm install --frozen-lockfile', 'pnpm install'],
    yarn: isBerry(manager)
      ? ['yarn install --immutable', 'yarn install --no-immutable']
      : ['yarn install --frozen-lockfile', 'yarn install'],
    bun: ['bun install --frozen-lockfile', 'bun install'],
  }[manager.name];
  return manager.locked ? locked : unlocked;
}

function nodeInstall(root, manager) {
  return hasProjectFile(root, 'package.json') ? run(nodeInstallCommand(manager)) : [];
}

function installsItself(root) {
  if (hasProjectFile(root, 'setup.py', 'setup.cfg')) {
    return true;
  }
  return (
    hasProjectFile(root, 'pyproject.toml') &&
    BUILDABLE_PYPROJECT.test(readFileSync(insideProject(root, 'pyproject.toml'), 'utf8'))
  );
}

function pipInstall(root, project) {
  const requirementFiles = readdirSync(root)
    .filter((name) => REQUIREMENTS_FILE.test(name))
    .toSorted();
  return [
    ...requirementFiles.map((file) => `${PIP_INSTALL} -r ${file}`),
    ...(installsItself(root) ? [`${PIP_INSTALL} -e .`] : []),
    installCommand(PIP_INSTALL, requiredPythonPeers(project)),
  ];
}

function pythonInstall(root, { project, peers }) {
  const sync = PYTHON_SYNC[project.tool];
  if (sync === undefined) {
    return pipInstall(root, project).flatMap(run);
  }
  const undeclared =
    peers.undeclared.length === 0
      ? []
      : [installCommand(pythonInstaller(project.tool), peers.undeclared)];
  return [...sync, ...undeclared].flatMap(run);
}

const FAMILY_STEPS = {
  node: (root, { project, repository }) => ({
    environment: nodeEnvironment(project.packageManager, repository),
    install: nodeInstall(root, project.packageManager),
  }),
  python: (root, context) => ({
    environment: [
      ...step('actions/setup-python@v5', { 'python-version': PYTHON_VERSION }),
      ...(context.project.tool === 'uv' ? step('astral-sh/setup-uv@v5') : []),
    ],
    install: pythonInstall(root, context),
  }),
  jvm: () => ({
    environment: step('actions/setup-java@v4', {
      distribution: 'temurin',
      'java-version': JAVA_VERSION,
    }),
    install: [],
  }),
};

function runCommand(root, { project, version }) {
  const ownsNodeProject = project.family === 'node' && hasProjectFile(root, 'package.json');
  return ownsNodeProject ? project.packageManager.run : `npx nitpicker@${version}`;
}

export function workflowParts(root, context) {
  const { environment, install } = FAMILY_STEPS[context.project.family](root, context);
  return {
    ENVIRONMENT_STEPS: environment,
    INSTALL_STEPS: install,
    RUN: runCommand(root, context),
  };
}
