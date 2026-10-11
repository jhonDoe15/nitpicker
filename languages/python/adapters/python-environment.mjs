import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

const NAMED_ENVIRONMENTS = ['uv', 'poetry', 'path'];
const LOCKFILE_ENVIRONMENTS = [
  ['uv.lock', 'uv'],
  ['poetry.lock', 'poetry'],
];
const VENV_DIRECTORY = '.venv';
const POETRY_TIMEOUT_MS = 60 * 1000;
const ENVIRONMENT_FAILED_RULE = 'environment-failed';

function environmentError(message) {
  return Object.assign(new Error(message), { rule: ENVIRONMENT_FAILED_RULE });
}

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
  return pathLauncher();
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
    throw environmentError(`No Python environment at ${directory} (${bin} does not exist)`);
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
  if (!hasUvEnvironment(projectRoot)) {
    throw environmentError(
      `uv has no environment for ${projectRoot}: run \`uv sync\` (or set UV_PROJECT_ENVIRONMENT) first`,
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

function hasUvEnvironment(projectRoot) {
  const configured = process.env.UV_PROJECT_ENVIRONMENT;
  if (configured !== undefined && configured !== '') {
    return existsSync(path.resolve(projectRoot, configured));
  }
  return ancestors(projectRoot).some((directory) =>
    existsSync(path.join(directory, VENV_DIRECTORY)),
  );
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
      `poetry has no environment for ${projectRoot}: run \`poetry install\` first (${result.stderr.trim() || 'no environment reported'})`,
    );
  }
  return directory;
}
