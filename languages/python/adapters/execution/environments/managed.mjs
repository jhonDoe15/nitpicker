import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { environmentError, OVERRIDE_HINT } from './environment-error.mjs';
import { condaLauncher } from './launchers.mjs';

export const MANAGED_ENVIRONMENTS = ['pipenv', 'hatch', 'conda'];
const MANAGER_TIMEOUT_MS = 60 * 1000;
const HATCH_ENVIRONMENTS_TABLE = /^\s*\[tool\.hatch\.envs[.\]]/m;
const CONDA_NAME = /^name:\s*['"]?([^\s'"#]+)/m;
const CONDA_PREFIX_LINE = /^prefix:[ \t]*(\S.*)$/m;
const QUOTES = /^['"]|['"]$/g;
const CONDA_BASE = 'base';

function declaresHatchEnvironments(projectRoot) {
  const pyproject = path.join(projectRoot, 'pyproject.toml');
  return (
    existsSync(path.join(projectRoot, 'hatch.toml')) ||
    (existsSync(pyproject) && HATCH_ENVIRONMENTS_TABLE.test(readFileSync(pyproject, 'utf8')))
  );
}

function condaFile(projectRoot) {
  const yml = path.join(projectRoot, 'environment.yml');
  const yaml = path.join(projectRoot, 'environment.yaml');
  return [yml, yaml].find((candidate) => existsSync(candidate));
}

function activeCondaPrefix(variables) {
  const prefix = variables.CONDA_PREFIX;
  const active = prefix !== undefined && prefix !== '';
  return active && variables.CONDA_DEFAULT_ENV !== CONDA_BASE ? prefix : undefined;
}

function hasPipfile(projectRoot) {
  return (
    existsSync(path.join(projectRoot, 'Pipfile')) ||
    existsSync(path.join(projectRoot, 'Pipfile.lock'))
  );
}

export function declaredManagedEnvironment(projectRoot) {
  if (hasPipfile(projectRoot)) {
    return 'pipenv';
  }
  if (declaresHatchEnvironments(projectRoot)) {
    return 'hatch';
  }
  return condaFile(projectRoot) === undefined ? undefined : 'conda';
}

export function activeCondaEnvironment(variables) {
  return activeCondaPrefix(variables) === undefined ? undefined : 'conda';
}

export function openActiveConda(variables) {
  const prefix = activeCondaPrefix(variables);
  return prefix === undefined ? undefined : condaLauncher(prefix, variables);
}

function askManager(manager, args, { projectRoot, variables }) {
  const result = spawnSync(manager, args, {
    cwd: projectRoot,
    encoding: 'utf8',
    timeout: MANAGER_TIMEOUT_MS,
    env: { ...variables, PIPENV_VERBOSITY: '-1' },
  });
  if (result.error?.code === 'ENOENT') {
    return undefined;
  }
  if (result.error !== undefined) {
    throw environmentError(`${manager} could not run for ${projectRoot}: ${result.error.message}`);
  }
  return result;
}

function pipenvLauncher(context) {
  const result = askManager('pipenv', ['--venv'], context);
  if (result === undefined) {
    return undefined;
  }
  const directory = result.stdout.trim();
  if (result.status !== 0 || directory === '') {
    throw environmentError(
      `pipenv has no virtualenv for ${context.projectRoot}: run \`pipenv install --dev\` first, ${OVERRIDE_HINT} (${result.stderr.trim() || 'no environment reported'})`,
    );
  }
  return context.virtualenv(directory, 'pipenv');
}

function hatchLauncher(context) {
  const result = askManager('hatch', ['env', 'find'], context);
  if (result === undefined) {
    return undefined;
  }
  const directory = result.stdout.trim().split(/\r?\n/).at(-1);
  if (result.status !== 0 || directory === '') {
    throw environmentError(
      `hatch has no environment for ${context.projectRoot}: run \`hatch env create\` first, ${OVERRIDE_HINT} (${result.stderr.trim() || 'no environment reported'})`,
    );
  }
  if (!existsSync(directory)) {
    throw environmentError(
      `hatch has not created its environment at ${directory}: run \`hatch env create\` first, ${OVERRIDE_HINT}`,
    );
  }
  return context.virtualenv(directory, 'hatch');
}

function condaEnvironmentNamed(name, context) {
  const result = askManager('conda', ['env', 'list', '--json'], context);
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

function declaredCondaPrefix(file, context) {
  const text = readFileSync(file, 'utf8');
  const declared = CONDA_PREFIX_LINE.exec(text)?.[1].trim().replaceAll(QUOTES, '');
  if (declared !== undefined) {
    return path.resolve(context.projectRoot, declared);
  }
  const name = CONDA_NAME.exec(text)?.[1];
  if (name === undefined || name === CONDA_BASE) {
    return undefined;
  }
  const active = activeCondaPrefix(context.variables);
  return active !== undefined && path.basename(active) === name
    ? active
    : condaEnvironmentNamed(name, context);
}

function condaOrActive(context) {
  const file = condaFile(context.projectRoot);
  const declared = file === undefined ? undefined : declaredCondaPrefix(file, context);
  const prefix = declared ?? activeCondaPrefix(context.variables);
  return prefix === undefined ? undefined : condaLauncher(prefix, context.variables);
}

const OPENERS = new Map([
  ['pipenv', pipenvLauncher],
  ['hatch', hatchLauncher],
  ['conda', condaOrActive],
]);

export function openManagedEnvironment(kind, context) {
  return OPENERS.get(kind)(context);
}
