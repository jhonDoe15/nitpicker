import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'smol-toml';
import { isPlainObject } from '../../../shared/config.mjs';
import { workspaceMembers } from './javascript-workspaces.mjs';

const UV_ORIGIN = 'uv workspace';
export const PYTHON_MARKERS = [
  'pyproject.toml',
  'setup.py',
  'setup.cfg',
  'Pipfile',
  'requirements.txt',
];
export const PYTHON_PROJECT_MARKERS = PYTHON_MARKERS.filter(
  (marker) => marker !== 'requirements.txt',
);

function parsedPyproject(file) {
  try {
    return { value: parse(readFileSync(file, 'utf8')) };
  } catch {
    return { value: undefined, unreadable: true };
  }
}

export function readPyproject(directory) {
  const file = path.join(directory, 'pyproject.toml');
  return existsSync(file) ? parsedPyproject(file).value : undefined;
}

function stringsOf(value) {
  return Array.isArray(value) ? value.filter((entry) => typeof entry === 'string') : [];
}

function uvPatterns(workspace) {
  return [
    ...stringsOf(workspace.members),
    ...stringsOf(workspace.exclude).map((pattern) => `!${pattern}`),
  ];
}

function isPythonPackage(pyproject) {
  return isPlainObject(pyproject?.project) || isPlainObject(pyproject?.tool?.poetry);
}

function uvWorkspaceOf(directory) {
  const workspace = readPyproject(directory)?.tool?.uv?.workspace;
  return isPlainObject(workspace) ? workspace : undefined;
}

export function pythonWorkspace(root, pythonDirectories) {
  const workspace = uvWorkspaceOf(root);
  if (workspace === undefined) {
    return { declared: false, members: [] };
  }
  const own = isPythonPackage(readPyproject(root)) ? [{ path: '.', origin: UV_ORIGIN }] : [];
  const members = workspaceMembers(uvPatterns(workspace), pythonDirectories);
  return {
    declared: true,
    members: [...own, ...members.map((directory) => ({ path: directory, origin: UV_ORIGIN }))],
  };
}
