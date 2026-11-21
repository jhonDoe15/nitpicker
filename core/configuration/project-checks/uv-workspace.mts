import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parseWithModule } from '../../../shared/values/parse-module.mts';
import { fieldOf, isPlainObject } from '../../../shared/values/readers.mts';

type Pyproject = { readonly value: unknown; readonly unreadable?: true };

export function parseToml(text: string): unknown {
  return parseWithModule('smol-toml', text);
}

function workspaceIn(pyproject: unknown): Record<string, unknown> | undefined {
  const workspace = fieldOf(fieldOf(fieldOf(pyproject, 'tool'), 'uv'), 'workspace');
  return isPlainObject(workspace) ? workspace : undefined;
}

function parsedPyproject(text: string): Pyproject {
  try {
    return { value: parseToml(text) };
  } catch {
    return { value: undefined, unreadable: true };
  }
}

export function readPyproject(directory: string): unknown {
  const file = path.join(directory, 'pyproject.toml');
  return existsSync(file) ? parsedPyproject(readFileSync(file, 'utf8')).value : undefined;
}

export function uvWorkspaceOf(directory: string): Record<string, unknown> | undefined {
  return workspaceIn(readPyproject(directory));
}

export function declaresUvWorkspace(text: string): boolean {
  return workspaceIn(parsedPyproject(text).value) !== undefined;
}
