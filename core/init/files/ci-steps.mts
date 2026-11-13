import { readdirSync, readFileSync } from 'node:fs';
import { hasProjectFile, insideProject } from '../support/inside-project.mjs';
import { installCommand } from '../peers/peer-plan.mts';
import { requiredPythonPeers } from '../peers/python-peers.mts';
import {
  condaEnvironmentName,
  condaFile,
} from '../../../languages/python/adapters/execution/environments/managed.mjs';
import type { InitProject, NodeManager, WorkflowContext } from '../init-types.mts';
import { textOf } from '../../../shared/values/readers.mts';
import { pythonVersion } from './workflow/python-version.mts';
import {
  DETAIL,
  type StepSettings,
  repositoryPath,
  run,
  step,
  yamlScalar,
} from './workflow/yaml-steps.mts';

type FamilySteps = {
  readonly environment: string[];
  readonly install: string[];
  readonly runDefaults?: StepSettings;
  readonly notes?: readonly string[];
};

type WorkflowParts = {
  readonly ENVIRONMENT_STEPS: string[];
  readonly INSTALL_STEPS: string[];
  readonly ACTION: string;
  readonly GATE_INPUTS: string[];
  readonly runDefaults: StepSettings;
  readonly notes: readonly string[];
};

const insidePath: (root: string, relative: string) => string = insideProject;
const hasFile: (root: string, ...names: string[]) => boolean = hasProjectFile;
const condaFileOf: (projectRoot: string) => string | undefined = condaFile;
const condaNameOf: (file: string) => string | undefined = condaEnvironmentName;

const ACTION = 'jhonDoe15/nitpicker';
const DEFAULT_PNPM = 10;
const PNPM_BY_LOCKFILE: readonly (readonly [string, number])[] = [
  ['9.', 10],
  ['6.', 8],
  ['5.4', 7],
  ['5.3', 6],
];
const LOCKFILE_VERSION = /^lockfileVersion:\s*['"]?(?<version>[\d.]+)/mu;
const JAVA_VERSION = 21;
const BUILDABLE_PYPROJECT = /^\s*\[(?:project|build-system)\]/mu;
const REQUIREMENTS_FILE = /^requirements[\w.-]*\.txt$/u;
const PIP_INSTALL = 'python -m pip install';
const PYTHON_SYNC: Readonly<Record<string, readonly string[]>> = {
  uv: ['uv sync'],
  poetry: ['pipx install poetry', 'poetry install'],
  pipenv: ['pipx install pipenv', 'pipenv install --dev'],
  pdm: ['pipx install pdm', 'pdm install'],
  hatch: ['pipx install hatch', 'hatch env create'],
};
const PEER_INSTALLERS: Readonly<Record<string, string>> = {
  uv: 'uv pip install',
  poetry: 'poetry run python -m pip install',
  pipenv: 'pipenv run python -m pip install',
  pdm: 'pdm run python -m pip install',
  hatch: 'hatch run python -m pip install',
  conda: 'conda install --yes --channel conda-forge',
};
const CONDA_ENVIRONMENT = 'nitpicker';
const LOGIN_SHELL = { shell: 'bash -el {0}' };

function lockedPnpmMajor(manager: NodeManager): number {
  const lockfile = insidePath(manager.root, 'pnpm-lock.yaml');
  const version = manager.locked
    ? LOCKFILE_VERSION.exec(readFileSync(lockfile, 'utf8'))?.groups?.['version']
    : undefined;
  return (
    PNPM_BY_LOCKFILE.find(([prefix]) => version?.startsWith(prefix) === true)?.[1] ?? DEFAULT_PNPM
  );
}

function pnpmSetup(manager: NodeManager, repository: string): string[] {
  const declaration = manager.declaration;
  if (declaration === undefined || !String(declaration.field).startsWith('pnpm@')) {
    return step('pnpm/action-setup@v4.4.0', { version: lockedPnpmMajor(manager) });
  }
  const file = repositoryPath(repository, insidePath(declaration.directory, 'package.json'));
  return step(
    'pnpm/action-setup@v4.4.0',
    file === 'package.json' ? {} : { package_json_file: file },
  );
}

function isBerry(manager: NodeManager): boolean {
  return manager.name === 'yarn' && (manager.major ?? 0) > 1;
}

function nodeEnvironment(manager: NodeManager, repository: string): string[] {
  const corepack = manager.declaration !== undefined || isBerry(manager);
  const tools: Readonly<Record<string, () => string[]>> = {
    pnpm: () => pnpmSetup(manager, repository),
    bun: () => step('oven-sh/setup-bun@v2.2.0'),
  };
  const tool = tools[textOf(manager.name)];
  return [...(corepack ? run('corepack enable') : []), ...(tool?.() ?? [])];
}

function nodeInstallCommand(manager: NodeManager): string {
  const commands: Readonly<Record<string, readonly [string, string]>> = {
    npm: ['npm ci', 'npm install'],
    pnpm: ['pnpm install --frozen-lockfile', 'pnpm install'],
    yarn: isBerry(manager)
      ? ['yarn install --immutable', 'yarn install --no-immutable']
      : ['yarn install --frozen-lockfile', 'yarn install'],
    bun: ['bun install --frozen-lockfile', 'bun install'],
  };
  const [locked, unlocked] = commands[textOf(manager.name)] ?? [];
  return textOf(manager.locked ? locked : unlocked);
}

function nodeInstall(root: string, manager: NodeManager): string[] {
  return hasFile(root, 'package.json') ? run(nodeInstallCommand(manager)) : [];
}

function installsItself(root: string): boolean {
  if (hasFile(root, 'setup.py', 'setup.cfg')) {
    return true;
  }
  return (
    hasFile(root, 'pyproject.toml') &&
    BUILDABLE_PYPROJECT.test(readFileSync(insidePath(root, 'pyproject.toml'), 'utf8'))
  );
}

function pipInstall(root: string, project: InitProject): string[] {
  const requirementFiles = readdirSync(root)
    .filter((name) => REQUIREMENTS_FILE.test(name))
    .toSorted();
  return [
    ...requirementFiles.map((file) => `${PIP_INSTALL} -r ${file}`),
    ...(installsItself(root) ? [`${PIP_INSTALL} -e .`] : []),
    installCommand(PIP_INSTALL, requiredPythonPeers(project)),
  ];
}

function peerInstall(project: InitProject): string[] {
  const installer = textOf(PEER_INSTALLERS[textOf(project.tool)]);
  return [installCommand(installer, requiredPythonPeers(project))];
}

function pythonInstall(root: string, context: WorkflowContext): string[] {
  const sync = PYTHON_SYNC[textOf(context.project.tool)];
  if (sync === undefined) {
    return pipInstall(root, context.project).flatMap((command) => run(command));
  }
  return [...sync, ...peerInstall(context.project)].flatMap((command) => run(command));
}

function pythonSteps(root: string, context: WorkflowContext): FamilySteps {
  const { settings, notes } = pythonVersion(root, context.repository);
  return {
    environment: [
      ...step('actions/setup-python@v7.1.0', settings),
      ...(context.project.tool === 'uv' ? step('astral-sh/setup-uv@v7.6.0') : []),
    ],
    install: pythonInstall(root, context),
    notes,
  };
}

function condaSteps(context: WorkflowContext, file: string): FamilySteps {
  const settings = {
    'environment-file': repositoryPath(context.repository, file),
    'activate-environment': condaNameOf(file) ?? CONDA_ENVIRONMENT,
    'auto-activate-base': false,
  };
  return {
    environment: step('conda-incubator/setup-miniconda@v3.3.0', settings),
    install: peerInstall(context.project).flatMap((command) => run(command)),
    runDefaults: LOGIN_SHELL,
  };
}

function nodeManagerOf(project: InitProject): NodeManager {
  if (project.packageManager === undefined) {
    throw new TypeError(`A ${project.family} project has no package manager`);
  }
  return project.packageManager;
}

const FAMILY_STEPS: Readonly<
  Record<string, (root: string, context: WorkflowContext) => FamilySteps>
> = {
  node: (root, { project, repository }) => ({
    environment: nodeEnvironment(nodeManagerOf(project), repository),
    install: nodeInstall(root, nodeManagerOf(project)),
  }),
  python: (root, context) => {
    const file = context.project.tool === 'conda' ? condaFileOf(root) : undefined;
    return file === undefined ? pythonSteps(root, context) : condaSteps(context, file);
  },
  jvm: () => ({
    environment: step('actions/setup-java@v6.1.0', {
      distribution: 'temurin',
      'java-version': JAVA_VERSION,
    }),
    install: [],
  }),
};

function gateInputs(root: string, { project, version, repository }: WorkflowContext): string[] {
  const folder = repositoryPath(repository, root);
  const ownsNodeProject = project.family === 'node' && hasFile(root, 'package.json');
  const inputs = {
    ...(folder === '' ? {} : { 'working-directory': folder }),
    ...(ownsNodeProject ? {} : { package: `nitpicker@${textOf(version)}` }),
  };
  return Object.entries(inputs).map(
    ([key, value]) => `${DETAIL}  ${key}: ${String(yamlScalar(value))}`,
  );
}

export function workflowParts(root: string, context: WorkflowContext): WorkflowParts {
  const familySteps = FAMILY_STEPS[context.project.family];
  if (familySteps === undefined) {
    throw new TypeError(`Unknown project family: ${context.project.family}`);
  }
  const { environment, install, runDefaults = {}, notes = [] } = familySteps(root, context);
  return {
    ENVIRONMENT_STEPS: environment,
    INSTALL_STEPS: install,
    ACTION: `${ACTION}@v${textOf(context.version)}`,
    GATE_INPUTS: gateInputs(root, context),
    runDefaults,
    notes,
  };
}
