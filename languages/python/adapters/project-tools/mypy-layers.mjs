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

const MODULE_SUFFIX = /\.pyi?$/u;
const STUBS_SUFFIX = /-stubs$/u;
const CONFIG_DIRECTORY_VARIABLE = /\$\{?MYPY_CONFIG_FILE_DIR\}?/gu;

function moduleName(entry) {
  if (entry.isDirectory()) {
    return entry.name.startsWith('.') ? undefined : entry.name.replace(STUBS_SUFFIX, '');
  }
  return MODULE_SUFFIX.test(entry.name) ? entry.name.replace(MODULE_SUFFIX, '') : undefined;
}

function ownModuleNames(roots) {
  return new Set(
    roots
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

function mypyPathRoots(projectRoot, mypyPath) {
  const entries = Array.isArray(mypyPath) ? mypyPath : String(mypyPath ?? '').split(/[:,]/u);
  return entries
    .map((entry) => entry.trim().replace(CONFIG_DIRECTORY_VARIABLE, projectRoot))
    .filter((entry) => entry !== '')
    .map((entry) => path.resolve(projectRoot, entry));
}

export function mypyOwnModules({ projectRoot, project }, model) {
  const root = path.resolve(projectRoot);
  return ownModuleNames([
    ...importRoots(root, project.sourceRoots),
    ...mypyPathRoots(root, model?.options?.mypy_path),
  ]);
}
