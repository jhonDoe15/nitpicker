import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { importRoots } from '../execution/python-project.mjs';
import { toolLayers } from './project-tool-layers.mjs';

export const MYPY_TOOL = 'mypy';
export const MYPY_LOOKED =
  'a mypy config (mypy.ini, .mypy.ini, pyproject.toml with a [tool.mypy] table, or setup.cfg with a [mypy] section)';
const ANY_MODULE = '*';

export function mypyLayers(context) {
  return toolLayers(context, MYPY_TOOL);
}

function moduleName(entry) {
  if (entry.isDirectory()) {
    return entry.name.startsWith('.') ? undefined : entry.name;
  }
  return entry.name.endsWith('.py') ? entry.name.slice(0, -'.py'.length) : undefined;
}

function ownModuleNames(projectRoot, sourceRoots) {
  return new Set(
    importRoots(projectRoot, sourceRoots)
      .filter((root) => existsSync(root))
      .flatMap((root) => readdirSync(root, { withFileTypes: true }))
      .map(moduleName)
      .filter((name) => name !== undefined),
  );
}

export function isOwnModulePattern(pattern, own) {
  const first = pattern.split('.')[0];
  return first === ANY_MODULE || own.has(first);
}

export function mypyOwnModules({ projectRoot, project }) {
  return ownModuleNames(path.resolve(projectRoot), project.sourceRoots);
}
