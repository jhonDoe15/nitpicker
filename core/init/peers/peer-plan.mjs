import { missingNodePeers } from './node-peers.mjs';
import { missingPythonPeers } from './python-peers.mjs';

const PYTHON_INSTALLERS = {
  uv: 'uv add --dev',
  poetry: 'poetry add --group dev',
  pipenv: 'pipenv install --dev',
  pdm: 'pdm add -dG dev',
};
const PIP_INSTALLER = 'python -m pip install';
const JVM_REQUIREMENTS = 'Java 21 or newer. nitpicker adds its own analysis tools to the build.';

export function shellQuoted(requirement) {
  return /^[\w@/.=-]+$/u.test(requirement) ? requirement : `'${requirement}'`;
}

export function pythonInstaller(tool) {
  return PYTHON_INSTALLERS[tool] ?? PIP_INSTALLER;
}

function nodePlan(projectRoot, project) {
  const missing = missingNodePeers(projectRoot, project.testRunner);
  return { missing, command: `${project.packageManager.add} ${missing.join(' ')}` };
}

function pythonPlan(projectRoot, project) {
  const missing = missingPythonPeers(projectRoot, project);
  return {
    missing,
    command: `${pythonInstaller(project.tool)} ${missing.map(shellQuoted).join(' ')}`,
  };
}

export function planPeers(projectRoot, project) {
  if (project.family === 'jvm') {
    return { missing: [], requirements: JVM_REQUIREMENTS };
  }
  const plan =
    project.family === 'python' ? pythonPlan(projectRoot, project) : nodePlan(projectRoot, project);
  return plan.missing.length === 0 ? { missing: [] } : plan;
}
