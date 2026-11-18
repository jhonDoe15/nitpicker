import { existsSync } from 'node:fs';
import path from 'node:path';
import { uvWorkspaceOf as untypedUvWorkspaceOf } from '../../../../core/configuration/project-checks/uv-workspace.mjs';
import type { Launcher } from '../typed/environment/launcher-types.mts';
import type { EnvironmentSpec } from './environments/typed/environment-types.mts';
import type { SpawnFunction } from './typed/process-types.mts';
import { spawnText } from './typed/spawn-text.mts';
import { ancestorDirectories } from '../../../../shared/filesystem.mjs';
import { baseEnvironment } from './environments/base/base-environment.mts';
import { environmentError, OVERRIDE_HINT } from './environments/environment-error.mts';
import { INSTALL_HINTS, installHint, isMissing } from './environments/install-hints.mts';
import {
  declaredManagedEnvironment,
  MANAGED_ENVIRONMENTS,
  openManagedEnvironment,
} from './environments/managed.mts';

const POETRY = 'poetry';
export { environmentError };

const ancestors: (directory: string) => string[] = ancestorDirectories;
const uvWorkspaceOf: (directory: string) => unknown = untypedUvWorkspaceOf;
const NAMED_ENVIRONMENTS = ['uv', POETRY, 'path', ...MANAGED_ENVIRONMENTS];
const LOCKFILE_ENVIRONMENTS: readonly (readonly [string, string])[] = [
  ['uv.lock', 'uv'],
  ['poetry.lock', POETRY],
];
const VENV_DIRECTORY = '.venv';
const POETRY_TIMEOUT_MS = 60 * 1000;
export function detectEnvironment(projectRoot: string, setting?: string): EnvironmentSpec {
  if (setting !== undefined && NAMED_ENVIRONMENTS.includes(setting)) {
    return { kind: setting };
  }
  if (setting !== undefined) {
    return { kind: 'venv', directory: path.resolve(projectRoot, setting) };
  }
  const locked = LOCKFILE_ENVIRONMENTS.find(([file]) => existsSync(path.join(projectRoot, file)));
  if (locked !== undefined) {
    return { kind: locked[1] };
  }
  if (uvWorkspaceRoot(projectRoot) !== undefined) {
    return { kind: 'uv' };
  }
  const declared = declaredManagedEnvironment(projectRoot);
  if (declared !== undefined) {
    return { kind: declared, detected: true };
  }
  return unmanagedEnvironment(projectRoot);
}

function unmanagedEnvironment(projectRoot: string): EnvironmentSpec {
  const directory = path.join(projectRoot, VENV_DIRECTORY);
  return existsSync(directory) ? { kind: 'venv', directory } : { kind: 'path' };
}

export function openSnapshotEnvironment({
  projectRoot,
  liveRoot,
  setting,
  spawn,
}: {
  projectRoot: string;
  liveRoot: string;
  setting: string | undefined;
  spawn?: SpawnFunction | undefined;
}): Launcher {
  return (
    baseEnvironment({ projectRoot, liveRoot, setting, virtualenv: venvLauncher }) ??
    openEnvironment(detectEnvironment(liveRoot, setting), liveRoot, spawn)
  );
}

export function openEnvironment(
  environment: EnvironmentSpec,
  projectRoot: string,
  spawn: SpawnFunction = spawnText,
): Launcher {
  if (environment.kind === 'uv') {
    return uvLauncher(projectRoot);
  }
  if (environment.kind === POETRY) {
    return venvLauncher(poetryDirectory(projectRoot, spawn), POETRY);
  }
  if (environment.kind === 'venv') {
    return venvLauncher(environment.directory ?? '', 'virtualenv');
  }
  if (MANAGED_ENVIRONMENTS.includes(environment.kind)) {
    const launcher = openManagedEnvironment(environment.kind, {
      projectRoot,
      virtualenv: venvLauncher,
      spawn,
    });
    return launcher ?? fallbackLauncher(environment, projectRoot);
  }
  return pathLauncher();
}

function fallbackLauncher(environment: EnvironmentSpec, projectRoot: string): Launcher {
  if (environment.detected !== true) {
    throw environmentError(
      `No ${environment.kind} environment found for ${projectRoot}: ${installHint(environment.kind)} or activate the environment, ${OVERRIDE_HINT}`,
    );
  }
  const unmanaged = unmanagedEnvironment(projectRoot);
  return unmanaged.kind === 'venv'
    ? venvLauncher(unmanaged.directory ?? '', 'virtualenv')
    : pathLauncher();
}

function pathLauncher(): Launcher {
  return {
    description: 'PATH',
    launch: (tool, args) => ({
      command: tool === 'python' && process.platform !== 'win32' ? 'python3' : tool,
      args,
      env: {},
    }),
  };
}

function venvLauncher(directory: string, description: string): Launcher {
  const bin = path.join(directory, process.platform === 'win32' ? 'Scripts' : 'bin');
  if (!existsSync(bin)) {
    throw environmentError(
      `No Python environment at ${directory} (${bin} does not exist): create it, ${OVERRIDE_HINT}`,
    );
  }
  const env = {
    VIRTUAL_ENV: directory,
    PATH: `${bin}${path.delimiter}${process.env['PATH'] ?? ''}`,
  };
  return {
    description,
    launch: (tool, args) => {
      const installed = path.join(bin, tool);
      return { command: existsSync(installed) ? installed : tool, args, env };
    },
  };
}

function uvLauncher(projectRoot: string): Launcher {
  const environment = uvEnvironmentDirectory(uvWorkspaceRoot(projectRoot) ?? projectRoot);
  if (!existsSync(environment)) {
    throw environmentError(
      `uv has no environment at ${environment}: run \`uv sync\` first (or set UV_PROJECT_ENVIRONMENT, ${OVERRIDE_HINT})${isMissing('uv') ? `; uv is not installed, ${INSTALL_HINTS.uv}` : ''}`,
    );
  }
  return {
    description: 'uv',
    launch: (tool, args) => ({
      command: 'uv',
      args: ['run', '--project', projectRoot, '--no-sync', '--', tool, ...args],
      env: {},
    }),
  };
}

function uvEnvironmentDirectory(workspaceRoot: string): string {
  const configured = process.env['UV_PROJECT_ENVIRONMENT'];
  return path.resolve(
    workspaceRoot,
    configured === undefined || configured === '' ? VENV_DIRECTORY : configured,
  );
}

function uvWorkspaceRoot(projectRoot: string): string | undefined {
  return ancestors(projectRoot).find(
    (directory) =>
      existsSync(path.join(directory, 'uv.lock')) &&
      (directory === projectRoot || uvWorkspaceOf(directory) !== undefined),
  );
}

function poetryDirectory(projectRoot: string, spawn: SpawnFunction): string {
  const result = spawn(POETRY, ['-C', projectRoot, 'env', 'info', '--path'], {
    encoding: 'utf8',
    timeout: POETRY_TIMEOUT_MS,
  });
  if (result.error?.code === 'ENOENT') {
    throw environmentError(
      `poetry is not installed, so its environment for ${projectRoot} cannot be found: ${INSTALL_HINTS.poetry}, ${OVERRIDE_HINT}`,
    );
  }
  if (result.error !== undefined) {
    throw environmentError(
      `poetry could not run for ${projectRoot}: ${String(result.error.message)}`,
    );
  }
  const directory = result.stdout.trim();
  if (result.status !== 0 || directory === '') {
    throw environmentError(
      `poetry has no environment for ${projectRoot}: run \`poetry install\` first, ${OVERRIDE_HINT} (${result.stderr.trim() || 'no environment reported'})`,
    );
  }
  return directory;
}
