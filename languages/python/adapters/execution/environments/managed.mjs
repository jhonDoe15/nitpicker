import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { condaLauncher, environmentError, OVERRIDE_HINT, venvLauncher } from './launchers.mjs';

export const MANAGED_ENVIRONMENTS = ['pipenv', 'hatch', 'conda'];
const MANAGER_TIMEOUT_MS = 60 * 1000;
const CONDA_FILES = ['environment.yml', 'environment.yaml'];
const HATCH_ENVIRONMENTS_TABLE = /^\s*\[tool\.hatch\.envs[.\]]/m;
const CONDA_NAME = /^name:\s*['"]?([^\s'"#]+)/m;
const CONDA_PREFIX_LINE = /^prefix:\s*['"]?([^\n'"#]+?)['"]?\s*$/m;
const CONDA_BASE = 'base';

function declaresHatchEnvironments(projectRoot) {
  const pyproject = path.join(projectRoot, 'pyproject.toml');
  return (
    existsSync(path.join(projectRoot, 'hatch.toml')) ||
    (existsSync(pyproject) && HATCH_ENVIRONMENTS_TABLE.test(readFileSync(pyproject, 'utf8')))
  );
}

function condaFile(projectRoot) {
  return CONDA_FILES.map((file) => path.join(projectRoot, file)).find((file) => existsSync(file));
}

function activeCondaPrefix() {
  const prefix = process.env.CONDA_PREFIX;
  const active = prefix !== undefined && prefix !== '';
  return active && process.env.CONDA_DEFAULT_ENV !== CONDA_BASE ? prefix : undefined;
}

export function declaredManagedEnvironment(projectRoot) {
  if (['Pipfile', 'Pipfile.lock'].some((file) => existsSync(path.join(projectRoot, file)))) {
    return 'pipenv';
  }
  if (declaresHatchEnvironments(projectRoot)) {
    return 'hatch';
  }
  return condaFile(projectRoot) === undefined ? undefined : 'conda';
}

export function activeCondaEnvironment() {
  return activeCondaPrefix() === undefined ? undefined : 'conda';
}

function askManager(manager, args, projectRoot) {
  const result = spawnSync(manager, args, {
    cwd: projectRoot,
    encoding: 'utf8',
    timeout: MANAGER_TIMEOUT_MS,
    env: { ...process.env, PIPENV_VERBOSITY: '-1' },
  });
  if (result.error?.code === 'ENOENT') {
    return undefined;
  }
  if (result.error !== undefined) {
    throw environmentError(`${manager} could not run for ${projectRoot}: ${result.error.message}`);
  }
  return result;
}

function pipenvLauncher(projectRoot) {
  const result = askManager('pipenv', ['--venv'], projectRoot);
  if (result === undefined) {
    return undefined;
  }
  const directory = result.stdout.trim();
  if (result.status !== 0 || directory === '') {
    throw environmentError(
      `pipenv has no virtualenv for ${projectRoot}: run \`pipenv install --dev\` first, ${OVERRIDE_HINT} (${result.stderr.trim() || 'no environment reported'})`,
    );
  }
  return venvLauncher(directory, 'pipenv');
}

function hatchLauncher(projectRoot) {
  const result = askManager('hatch', ['env', 'find'], projectRoot);
  if (result === undefined) {
    return undefined;
  }
  const directory = result.stdout.trim().split(/\r?\n/).at(-1);
  if (result.status !== 0 || directory === '') {
    throw environmentError(
      `hatch has no environment for ${projectRoot}: run \`hatch env create\` first, ${OVERRIDE_HINT} (${result.stderr.trim() || 'no environment reported'})`,
    );
  }
  if (!existsSync(directory)) {
    throw environmentError(
      `hatch has not created its environment at ${directory}: run \`hatch env create\` first, ${OVERRIDE_HINT}`,
    );
  }
  return venvLauncher(directory, 'hatch');
}

function condaEnvironmentNamed(name, projectRoot) {
  const result = askManager('conda', ['env', 'list', '--json'], projectRoot);
  if (result === undefined) {
    return undefined;
  }
  const prefixes = result.status === 0 ? (JSON.parse(result.stdout).envs ?? []) : [];
  const found = prefixes.find((prefix) => path.basename(prefix) === name);
  if (found === undefined) {
    throw environmentError(
      `conda has no environment named ${name}: run \`conda env create -f environment.yml\` first, ${OVERRIDE_HINT}`,
    );
  }
  return found;
}

function declaredCondaPrefix(file, projectRoot) {
  const text = readFileSync(file, 'utf8');
  const declared = CONDA_PREFIX_LINE.exec(text)?.[1];
  if (declared !== undefined) {
    return path.resolve(projectRoot, declared);
  }
  const name = CONDA_NAME.exec(text)?.[1];
  const active = activeCondaPrefix();
  if (name === undefined || name === CONDA_BASE) {
    return undefined;
  }
  return active !== undefined && path.basename(active) === name
    ? active
    : condaEnvironmentNamed(name, projectRoot);
}

function condaPrefix(projectRoot) {
  const file = condaFile(projectRoot);
  return (
    (file === undefined ? undefined : declaredCondaPrefix(file, projectRoot)) ?? activeCondaPrefix()
  );
}

function condaOrUndefined(projectRoot) {
  const prefix = condaPrefix(projectRoot);
  return prefix === undefined ? undefined : condaLauncher(prefix);
}

const OPENERS = new Map([
  ['pipenv', pipenvLauncher],
  ['hatch', hatchLauncher],
  ['conda', condaOrUndefined],
]);

export function openManagedEnvironment(kind, projectRoot) {
  return OPENERS.get(kind)(projectRoot);
}
