import { readManifest } from '../../../languages/typescript/preset/eslint-config/scope-support.mjs';
import { hasProjectFile } from '../support/inside-project.mjs';
import { pythonInstaller, shellQuoted } from '../peers/peer-plan.mjs';

const STEP = '      - ';
const DETAIL = '        ';
const PNPM_VERSION = 10;
const PYTHON_VERSION = '3.13';
const JAVA_VERSION = 21;

function step(uses, settings = {}) {
  const entries = Object.entries(settings);
  return [
    `${STEP}uses: ${uses}`,
    ...(entries.length === 0 ? [] : [`${DETAIL}with:`]),
    ...entries.map(([key, value]) => `${DETAIL}  ${key}: ${String(value)}`),
  ];
}

function run(command) {
  return [`${STEP}run: ${command}`];
}

function pnpmSetup(root) {
  const declared = String(readManifest(root)?.packageManager ?? '').startsWith('pnpm@');
  return step('pnpm/action-setup@v4', declared ? {} : { version: PNPM_VERSION });
}

function nodeEnvironment(root, manager) {
  if (manager.name === 'pnpm') {
    return pnpmSetup(root);
  }
  return manager.name === 'bun' ? step('oven-sh/setup-bun@v2') : [];
}

function nodeInstall(root, manager) {
  const commands = {
    npm: hasProjectFile(root, 'package-lock.json', 'npm-shrinkwrap.json')
      ? 'npm ci'
      : 'npm install',
    pnpm: 'pnpm install --frozen-lockfile',
    yarn: hasProjectFile(root, '.yarnrc.yml')
      ? 'yarn install --immutable'
      : 'yarn install --frozen-lockfile',
    bun: 'bun install --frozen-lockfile',
  };
  return hasProjectFile(root, 'package.json') ? run(commands[manager.name]) : [];
}

function pythonInstall(root, { project, missing }) {
  const pip = 'python -m pip install';
  const commands = {
    uv: ['uv sync'],
    poetry: ['pipx install poetry', 'poetry install'],
    pipenv: ['pipx install pipenv', 'pipenv install --dev'],
    pdm: ['pipx install pdm', 'pdm install'],
  }[project.tool] ?? [
    hasProjectFile(root, 'requirements.txt') ? `${pip} -r requirements.txt` : `${pip} -e .`,
    ...(missing.length === 0
      ? []
      : [`${pythonInstaller(project.tool)} ${missing.map(shellQuoted).join(' ')}`]),
  ];
  return commands.flatMap(run);
}

const FAMILY_STEPS = {
  node: (root, { project }) => ({
    environment: nodeEnvironment(root, project.packageManager),
    install: nodeInstall(root, project.packageManager),
  }),
  python: (root, context) => ({
    environment: [
      ...step('actions/setup-python@v5', { 'python-version': `'${PYTHON_VERSION}'` }),
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
