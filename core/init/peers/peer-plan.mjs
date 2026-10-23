import { missingNodePeers } from './node-peers.mjs';
import { pythonPeerStatus } from './python-peers.mjs';

const PYTHON_INSTALLERS = {
  uv: 'uv add --dev',
  poetry: 'poetry add --group dev',
  pipenv: 'pipenv install --dev',
  pdm: 'pdm add -dG dev',
  hatch: 'hatch run python -m pip install',
  conda: 'conda install --channel conda-forge',
};
const PIP_INSTALLER = 'python -m pip install';
const PYTHON_ADVICE = {
  hatch:
    'This installs them into the default hatch environment, which nitpicker uses. To keep them, list them in "dependencies" under [tool.hatch.envs.default].',
  conda:
    "Run it with the project's conda environment active, or add the packages to environment.yml.",
};
const JVM_REQUIREMENTS = 'Java 21 or newer. nitpicker adds its own analysis tools to the build.';
const NOTHING = { missing: [], undeclared: [], installedOnly: [] };

export function shellQuoted(requirement) {
  return /^[\w@/.=-]+$/u.test(requirement) ? requirement : `'${requirement}'`;
}

export function pythonInstaller(tool) {
  return PYTHON_INSTALLERS[tool] ?? PIP_INSTALLER;
}

export function installCommand(installer, requirements) {
  return `${installer} ${requirements.map(shellQuoted).join(' ')}`;
}

function nodePlan(projectRoot, project) {
  const missing = missingNodePeers(projectRoot, project.testRunner);
  return { ...NOTHING, missing, command: installCommand(project.packageManager.add, missing) };
}

function requirementsWhere(status, keep) {
  return status.filter(keep).map(({ requirement }) => requirement);
}

function pythonPlan(projectRoot, project) {
  const status = pythonPeerStatus(projectRoot, project);
  const missing = requirementsWhere(status, ({ declared, installed }) => !declared && !installed);
  return {
    missing,
    undeclared: requirementsWhere(status, ({ declared }) => !declared),
    installedOnly: requirementsWhere(status, ({ declared, installed }) => !declared && installed),
    command: installCommand(pythonInstaller(project.tool), missing),
    advice: PYTHON_ADVICE[project.tool],
  };
}

export function planPeers(projectRoot, project) {
  if (project.family === 'jvm') {
    return { ...NOTHING, requirements: JVM_REQUIREMENTS };
  }
  const plan =
    project.family === 'python' ? pythonPlan(projectRoot, project) : nodePlan(projectRoot, project);
  return plan.missing.length === 0
    ? { ...NOTHING, undeclared: plan.undeclared, installedOnly: plan.installedOnly }
    : plan;
}
