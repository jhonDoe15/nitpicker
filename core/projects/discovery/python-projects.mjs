import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'smol-toml';
import { isPlainObject } from '../../../shared/config.mjs';
import { isSkippedLocation, outermost } from './repository-files.mjs';
import { workspaceMembers } from './javascript-workspaces.mjs';

const UV_ORIGIN = 'uv workspace';
const PYPROJECT_ORIGIN = 'pyproject.toml';

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

function nestedProjects(directories) {
  return outermost(
    directories.filter((directory) => directory !== '.' && !isSkippedLocation(directory)),
  ).map((directory) => ({ path: directory, origin: PYPROJECT_ORIGIN }));
}

export function pythonProjects(root, pyprojectDirectories) {
  const rootProject = readPyproject(root);
  const workspace = rootProject?.tool?.uv?.workspace;
  const own = isPlainObject(rootProject?.project)
    ? [{ path: '.', origin: isPlainObject(workspace) ? UV_ORIGIN : PYPROJECT_ORIGIN }]
    : [];
  if (isPlainObject(workspace)) {
    const members = workspaceMembers(uvPatterns(workspace), pyprojectDirectories);
    return {
      declared: true,
      members: [...own, ...members.map((directory) => ({ path: directory, origin: UV_ORIGIN }))],
    };
  }
  return { declared: false, members: [...own, ...nestedProjects(pyprojectDirectories)] };
}
