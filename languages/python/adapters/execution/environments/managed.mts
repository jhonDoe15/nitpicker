import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fieldOf, parseJson, textsOf } from '../../../../../shared/values/readers.mts';
import type { Launcher } from '../../typed/environment/launcher-types.mts';
import type { SpawnResult } from '../typed/process-types.mts';
import { spawnText } from '../typed/spawn-text.mts';
import { environmentError, OVERRIDE_HINT } from './environment-error.mts';
import type { ManagerContext } from './typed/environment-types.mts';
import { condaLauncher } from './launchers.mts';

const PIPENV = 'pipenv';
const HATCH = 'hatch';
const CONDA = 'conda';
export const MANAGED_ENVIRONMENTS = [PIPENV, HATCH, CONDA];
const MANAGER_TIMEOUT_MS = 60 * 1000;
const HATCH_ENVIRONMENTS_TABLE = /^\s*\[tool\.hatch\.envs[.\]]/m;
const CONDA_NAME = /^name:\s*['"]?([^\s'"#]+)/m;
const CONDA_PREFIX_LINE = /^prefix:[ \t]*(\S.*)$/m;
const QUOTES = /^['"]|['"]$/g;
const CONDA_BASE = 'base';

function declaresHatchEnvironments(projectRoot: string): boolean {
  const pyproject = path.join(projectRoot, 'pyproject.toml');
  return (
    existsSync(path.join(projectRoot, 'hatch.toml')) ||
    (existsSync(pyproject) && HATCH_ENVIRONMENTS_TABLE.test(readFileSync(pyproject, 'utf8')))
  );
}

export function condaFile(projectRoot: string): string | undefined {
  const yml = path.join(projectRoot, 'environment.yml');
  const yaml = path.join(projectRoot, 'environment.yaml');
  return [yml, yaml].find((candidate) => existsSync(candidate));
}

export function condaEnvironmentName(file: string): string | undefined {
  return CONDA_NAME.exec(readFileSync(file, 'utf8'))?.[1];
}

function hasPipfile(projectRoot: string): boolean {
  return (
    existsSync(path.join(projectRoot, 'Pipfile')) ||
    existsSync(path.join(projectRoot, 'Pipfile.lock'))
  );
}

export function declaredManagedEnvironment(projectRoot: string): string | undefined {
  if (hasPipfile(projectRoot)) {
    return PIPENV;
  }
  if (declaresHatchEnvironments(projectRoot)) {
    return HATCH;
  }
  return condaFile(projectRoot) === undefined ? undefined : CONDA;
}

function askManager(
  manager: string,
  args: readonly string[],
  { projectRoot, spawn = spawnText }: ManagerContext,
): SpawnResult | undefined {
  const result = spawn(manager, args, {
    cwd: projectRoot,
    encoding: 'utf8',
    timeout: MANAGER_TIMEOUT_MS,
  });
  if (result.error?.code === 'ENOENT') {
    return undefined;
  }
  if (result.error !== undefined) {
    throw environmentError(
      `${manager} could not run for ${projectRoot}: ${String(result.error.message)}`,
    );
  }
  return result;
}

function pipenvLauncher(context: ManagerContext): Launcher | undefined {
  const result = askManager(PIPENV, ['--venv'], context);
  if (result === undefined) {
    return undefined;
  }
  const directory = result.stdout.trim();
  if (result.status !== 0 || directory === '') {
    throw environmentError(
      `pipenv has no virtualenv for ${context.projectRoot}: run \`pipenv install --dev\` first, ${OVERRIDE_HINT} (${result.stderr.trim() || 'no environment reported'})`,
    );
  }
  return context.virtualenv(directory, PIPENV);
}

function hatchLauncher(context: ManagerContext): Launcher | undefined {
  const result = askManager(HATCH, ['env', 'find'], context);
  if (result === undefined) {
    return undefined;
  }
  const directory = result.stdout.trim().split(/\r?\n/).at(-1) ?? '';
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
  return context.virtualenv(directory, HATCH);
}

function condaEnvironmentNamed(name: string, context: ManagerContext): string | undefined {
  const result = askManager(CONDA, ['env', 'list', '--json'], context);
  if (result === undefined) {
    return undefined;
  }
  const prefixes = result.status === 0 ? textsOf(fieldOf(parseJson(result.stdout), 'envs')) : [];
  const found = prefixes.find((prefix) => path.basename(prefix) === name);
  if (found === undefined) {
    throw environmentError(
      `conda has no environment named ${name}: run \`conda env create -f environment.yml\` first, ${OVERRIDE_HINT}`,
    );
  }
  return found;
}

function declaredCondaPrefix(file: string, context: ManagerContext): string | undefined {
  const text = readFileSync(file, 'utf8');
  const declared = CONDA_PREFIX_LINE.exec(text)?.[1]?.trim().replaceAll(QUOTES, '');
  if (declared !== undefined) {
    return path.resolve(context.projectRoot, declared);
  }
  const name = CONDA_NAME.exec(text)?.[1];
  if (name === undefined || name === CONDA_BASE) {
    return undefined;
  }
  return condaEnvironmentNamed(name, context);
}

function condaLauncherOfProject(context: ManagerContext): Launcher | undefined {
  const file = condaFile(context.projectRoot);
  const prefix = file === undefined ? undefined : declaredCondaPrefix(file, context);
  return prefix === undefined ? undefined : condaLauncher(prefix);
}

const OPENERS = new Map<string, (context: ManagerContext) => Launcher | undefined>([
  [PIPENV, pipenvLauncher],
  [HATCH, hatchLauncher],
  [CONDA, condaLauncherOfProject],
]);

export function openManagedEnvironment(
  kind: string,
  context: ManagerContext,
): Launcher | undefined {
  return OPENERS.get(kind)?.(context);
}
