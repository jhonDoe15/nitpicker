import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { environmentError, OVERRIDE_HINT } from './environments/environment-error.mjs';
import {
  declaredManagedEnvironment,
  MANAGED_ENVIRONMENTS,
  openManagedEnvironment,
} from './environments/managed.mjs';

export { environmentError };

const NAMED_ENVIRONMENTS = ['uv', 'poetry', 'path', ...MANAGED_ENVIRONMENTS];
const LOCKFILE_ENVIRONMENTS = [
  ['uv.lock', 'uv'],
  ['poetry.lock', 'poetry'],
];
const VENV_DIRECTORY = '.venv';
const UV_WORKSPACE_TABLE = /^\s*\[tool\.uv\.workspace\]/m;
const POETRY_TIMEOUT_MS = 60 * 1000;
export function detectEnvironment(projectRoot, setting) {
  if (NAMED_ENVIRONMENTS.includes(setting)) {
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

function unmanagedEnvironment(projectRoot) {
  const directory = path.join(projectRoot, VENV_DIRECTORY);
  return existsSync(directory) ? { kind: 'venv', directory } : { kind: 'path' };
}

export function openEnvironment(environment, projectRoot) {
  if (environment.kind === 'uv') {
    return uvLauncher(projectRoot);
  }
  if (environment.kind === 'poetry') {
    return venvLauncher(poetryDirectory(projectRoot), 'poetry');
  }
  if (environment.kind === 'venv') {
    return venvLauncher(environment.directory, 'virtualenv');
  }
  if (MANAGED_ENVIRONMENTS.includes(environment.kind)) {
    const launcher = openManagedEnvironment(environment.kind, {
      projectRoot,
      virtualenv: venvLauncher,
    });
    return launcher ?? fallbackLauncher(environment, projectRoot);
  }
  return pathLauncher();
}

function fallbackLauncher(environment, projectRoot) {
  if (environment.detected !== true) {
    throw environmentError(
      `No ${environment.kind} environment found for ${projectRoot}: install ${environment.kind} or activate the environment, ${OVERRIDE_HINT}`,
    );
  }
  const unmanaged = unmanagedEnvironment(projectRoot);
  return unmanaged.kind === 'venv'
    ? venvLauncher(unmanaged.directory, 'virtualenv')
    : pathLauncher();
}

function pathLauncher() {
  return {
    description: 'PATH',
    launch: (tool, args) => ({
      command: tool === 'python' && process.platform !== 'win32' ? 'python3' : tool,
      args,
      env: {},
    }),
  };
}

function venvLauncher(directory, description) {
  const bin = path.join(directory, process.platform === 'win32' ? 'Scripts' : 'bin');
  if (!existsSync(bin)) {
    throw environmentError(
      `No Python environment at ${directory} (${bin} does not exist): create it, ${OVERRIDE_HINT}`,
    );
  }
  const env = { VIRTUAL_ENV: directory, PATH: `${bin}${path.delimiter}${process.env.PATH ?? ''}` };
  return {
    description,
    launch: (tool, args) => {
      const installed = path.join(bin, tool);
      return { command: existsSync(installed) ? installed : tool, args, env };
    },
  };
}

function uvLauncher(projectRoot) {
  const environment = uvEnvironmentDirectory(uvWorkspaceRoot(projectRoot) ?? projectRoot);
  if (!existsSync(environment)) {
    throw environmentError(
      `uv has no environment at ${environment}: run \`uv sync\` first (or set UV_PROJECT_ENVIRONMENT, ${OVERRIDE_HINT})`,
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

function uvEnvironmentDirectory(workspaceRoot) {
  const configured = process.env.UV_PROJECT_ENVIRONMENT;
  return path.resolve(
    workspaceRoot,
    configured === undefined || configured === '' ? VENV_DIRECTORY : configured,
  );
}

function uvWorkspaceRoot(projectRoot) {
  return ancestors(projectRoot).find(
    (directory) =>
      existsSync(path.join(directory, 'uv.lock')) &&
      (directory === projectRoot || declaresUvWorkspace(directory)),
  );
}

function declaresUvWorkspace(directory) {
  const pyproject = path.join(directory, 'pyproject.toml');
  return existsSync(pyproject) && UV_WORKSPACE_TABLE.test(readFileSync(pyproject, 'utf8'));
}

function ancestors(directory) {
  const found = [directory];
  for (const current of found) {
    const parent = path.dirname(current);
    if (parent !== current) {
      found.push(parent);
    }
  }
  return found;
}

function poetryDirectory(projectRoot) {
  const result = spawnSync('poetry', ['-C', projectRoot, 'env', 'info', '--path'], {
    encoding: 'utf8',
    timeout: POETRY_TIMEOUT_MS,
  });
  if (result.error !== undefined) {
    throw environmentError(`poetry could not run for ${projectRoot}: ${result.error.message}`);
  }
  const directory = result.stdout.trim();
  if (result.status !== 0 || directory === '') {
    throw environmentError(
      `poetry has no environment for ${projectRoot}: run \`poetry install\` first, ${OVERRIDE_HINT} (${result.stderr.trim() || 'no environment reported'})`,
    );
  }
  return directory;
}
