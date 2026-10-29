import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { isPlainObject } from '../../shared/config.mjs';

function parseToml(text) {
  return createRequire(import.meta.url)('smol-toml').parse(text);
}

function workspaceIn(pyproject) {
  const workspace = pyproject?.tool?.uv?.workspace;
  return isPlainObject(workspace) ? workspace : undefined;
}

function parsedPyproject(text) {
  try {
    return { value: parseToml(text) };
  } catch {
    return { value: undefined, unreadable: true };
  }
}

export function readPyproject(directory) {
  const file = path.join(directory, 'pyproject.toml');
  return existsSync(file) ? parsedPyproject(readFileSync(file, 'utf8')).value : undefined;
}

export function uvWorkspaceOf(directory) {
  return workspaceIn(readPyproject(directory));
}

export function declaresUvWorkspace(text) {
  return workspaceIn(parsedPyproject(text).value) !== undefined;
}
