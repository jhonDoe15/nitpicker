import { textOf } from '../../../shared/values/readers.mts';
import { assertTypeScriptNode, missingNodePeers } from './node-peers.mts';
import { pythonPeerStatus } from './python-peers.mts';
import type { InitProject, Peers } from '../init-types.mts';

type PeerStatus = {
  readonly requirement: string;
  readonly declared: boolean;
  readonly installed: boolean;
};

const PYTHON_INSTALLERS: Readonly<Record<string, string>> = {
  uv: 'uv add --dev',
  poetry: 'poetry add --group dev',
  pipenv: 'pipenv install --dev',
  pdm: 'pdm add -dG dev',
  hatch: 'hatch run python -m pip install',
  conda: 'conda install --channel conda-forge',
};
const PIP_INSTALLER = 'python -m pip install';
const PYTHON_ADVICE: Readonly<Record<string, string>> = {
  hatch:
    'This installs them into the default hatch environment, which nitpicker uses. To keep them, list them in "dependencies" under [tool.hatch.envs.default].',
  conda:
    "Run it with the project's conda environment active, or add the packages to environment.yml.",
};
const JVM_REQUIREMENTS = 'Java 21 or newer. nitpicker adds its own analysis tools to the build.';
const NOTHING: Peers = { missing: [], uninstalled: [], undeclared: [], installedOnly: [] };

export function shellQuoted(requirement: string): string {
  return /^[\w@/.=-]+$/u.test(requirement) ? requirement : `'${requirement}'`;
}

export function pythonInstaller(tool: string | undefined): string {
  return PYTHON_INSTALLERS[textOf(tool)] ?? PIP_INSTALLER;
}

export function installCommand(installer: string, requirements: readonly string[]): string {
  return `${installer} ${requirements.map(shellQuoted).join(' ')}`;
}

function adviceOf(tool: string | undefined): { readonly advice?: string } {
  const advice = PYTHON_ADVICE[textOf(tool)];
  return advice === undefined ? {} : { advice };
}

function nodePlan(projectRoot: string, project: InitProject, nodeVersion: string): Peers {
  assertTypeScriptNode(projectRoot, nodeVersion);
  const { add, uninstalled } = missingNodePeers(projectRoot, project.testRunner, nodeVersion);
  return {
    ...NOTHING,
    missing: add,
    uninstalled,
    command:
      add.length === 0
        ? textOf(project.packageManager?.install)
        : installCommand(textOf(project.packageManager?.add), add),
  };
}

function requirementsWhere(
  status: readonly PeerStatus[],
  keep: (peer: PeerStatus) => boolean,
): string[] {
  return status.filter(keep).map(({ requirement }) => requirement);
}

function pythonPlan(projectRoot: string, project: InitProject): Peers {
  const status = pythonPeerStatus(projectRoot, project);
  const missing = requirementsWhere(status, ({ declared, installed }) => !declared && !installed);
  return {
    missing,
    uninstalled: [],
    undeclared: requirementsWhere(status, ({ declared }) => !declared),
    installedOnly: requirementsWhere(status, ({ declared, installed }) => !declared && installed),
    command: installCommand(pythonInstaller(project.tool), missing),
    ...adviceOf(project.tool),
  };
}

export function planPeers(
  projectRoot: string,
  project: InitProject,
  nodeVersion: string = process.versions.node,
): Peers {
  if (project.family === 'jvm') {
    return { ...NOTHING, requirements: JVM_REQUIREMENTS };
  }
  const plan =
    project.family === 'python'
      ? pythonPlan(projectRoot, project)
      : nodePlan(projectRoot, project, nodeVersion);
  return plan.missing.length === 0 && plan.uninstalled.length === 0
    ? { ...NOTHING, undeclared: plan.undeclared, installedOnly: plan.installedOnly }
    : plan;
}
