import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fieldOf, isPlainObject } from '../../../shared/values/readers.mts';

type Pyproject = { readonly value: unknown; readonly unreadable?: true };

export function parseToml(text: string): unknown {
  const smol: unknown = createRequire(import.meta.url)('smol-toml');
  const parse = fieldOf(smol, 'parse');
  if (typeof parse !== 'function') {
    throw new TypeError('smol-toml has no parse function');
  }
  return Reflect.apply(parse, smol, [text]);
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
