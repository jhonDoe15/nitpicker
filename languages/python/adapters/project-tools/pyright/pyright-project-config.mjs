import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parseJsonc } from '../../../../../shared/jsonc/jsonc.mjs';
import { attempt, parseToml } from '../project-tool-layers.mjs';

export const PYRIGHT_JSON = 'pyrightconfig.json';
const PYPROJECT = 'pyproject.toml';
const TABLES = { pyright: ['pyright'], basedpyright: ['basedpyright', 'pyright'] };
const ENVIRONMENT_PATH_KEYS = ['venvPath', 'typeshedPath'];
const SOURCE_PATH_KEYS = ['stubPath'];
const PATH_LIST_KEYS = ['extraPaths', 'include', 'exclude', 'ignore', 'strict'];
const ENVIRONMENT_KEYS = ['venv', 'venvPath', 'pythonVersion', 'pythonPlatform', 'stubPath'];
const ENVIRONMENT_ROOT_KEYS = ['root', 'extraPaths', 'pythonVersion', 'pythonPlatform'];
const MAXIMUM_EXTENDS_DEPTH = 8;

function readTable(file, checker) {
  const tool = parseToml(readFileSync(file, 'utf8')).tool ?? {};
  const name = TABLES[checker].find((candidate) => tool[candidate] !== undefined);
  return name === undefined ? undefined : { config: tool[name], table: `[tool.${name}]` };
}

function readFileConfig(file, checker) {
  if (path.basename(file) === PYPROJECT) {
    return readTable(file, checker);
  }
  const text = readFileSync(file, 'utf8');
  return { config: file.endsWith('.toml') ? parseToml(text) : parseJsonc(text) };
}

function absolute(directory, entry) {
  return typeof entry === 'string' ? path.resolve(directory, entry) : entry;
}

function absolutized(config, { original, source }) {
  const result = { ...config };
  for (const key of ENVIRONMENT_PATH_KEYS) {
    if (result[key] !== undefined) {
      result[key] = absolute(original, result[key]);
    }
  }
  for (const key of SOURCE_PATH_KEYS) {
    if (result[key] !== undefined) {
      result[key] = absolute(source, result[key]);
    }
  }
  for (const key of PATH_LIST_KEYS) {
    if (Array.isArray(result[key])) {
      result[key] = result[key].map((entry) => absolute(source, entry));
    }
  }
  if (result.venv !== undefined && result.venvPath === undefined) {
    result.venvPath = original;
  }
  if (Array.isArray(result.executionEnvironments)) {
    result.executionEnvironments = result.executionEnvironments.map((environment) => ({
      ...environment,
      root: absolute(source, environment.root ?? '.'),
      ...(Array.isArray(environment.extraPaths)
        ? { extraPaths: environment.extraPaths.map((entry) => absolute(source, entry)) }
        : {}),
    }));
  }
  return result;
}

function parentOf(file, config) {
  const parent =
    typeof config.extends === 'string'
      ? path.resolve(path.dirname(file), config.extends)
      : undefined;
  return parent !== undefined && existsSync(parent) ? parent : undefined;
}

function linkOf(file, read, rebase) {
  const original = path.dirname(file);
  const config = absolutized(read.config, { original, source: rebase(original) });
  return { file, table: read.table, config };
}

function chainOf(first, checker, rebase) {
  const links = [];
  const files = [];
  const pending = [first];
  for (const file of pending) {
    files.push(file);
    const { value: read, error } = attempt(() => readFileConfig(file, checker));
    if (error !== undefined || read === undefined) {
      return { links, files, unreadable: error?.message };
    }
    links.push(linkOf(file, read, rebase));
    const parent = parentOf(file, read.config);
    if (parent !== undefined && links.length <= MAXIMUM_EXTENDS_DEPTH) {
      pending.push(parent);
    }
  }
  return { links, files };
}

function hasMarker(directory) {
  return existsSync(path.join(directory, '.git'));
}

function searchedDirectories(root) {
  const parts = root.split(path.sep);
  const ancestors = parts.map(
    (_, index) => parts.slice(0, parts.length - index).join(path.sep) || path.sep,
  );
  const top = ancestors.findIndex(hasMarker);
  return top === -1 ? [root] : ancestors.slice(0, top + 1);
}

function locateIn(directory, checker) {
  const json = path.join(directory, PYRIGHT_JSON);
  if (existsSync(json)) {
    return json;
  }
  const pyproject = path.join(directory, PYPROJECT);
  if (!existsSync(pyproject)) {
    return undefined;
  }
  const { value, error } = attempt(() => readTable(pyproject, checker));
  return value !== undefined || error !== undefined ? pyproject : undefined;
}

function locate(directories, checker) {
  return directories
    .map((directory) => locateIn(directory, checker))
    .find((file) => file !== undefined);
}

function rebaser(root, directories, projectRoot) {
  const ceiling = directories.at(-1);
  return (directory) => {
    const relative = path.relative(ceiling, directory);
    const inside = relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
    return inside ? path.join(projectRoot, path.relative(root, directory)) : directory;
  };
}

function loadProjectPyright(root, checker, options) {
  const directories = options.upward ? searchedDirectories(root) : [root];
  const file = locate(directories, checker);
  if (file === undefined) {
    return undefined;
  }
  const rebase = rebaser(root, directories, options.projectRoot ?? root);
  const { links, files, unreadable } = chainOf(file, checker, rebase);
  if (unreadable !== undefined) {
    return { file, files, unreadable, table: undefined };
  }
  const merged = Object.assign({}, ...links.toReversed().map((link) => link.config));
  return {
    file,
    files,
    table: links[0].table,
    config: Object.fromEntries(Object.entries(merged).filter(([key]) => key !== 'extends')),
  };
}

export function readProjectPyright(root, checker, options = {}) {
  return attempt(() => loadProjectPyright(root, checker, options)).value;
}

export function pyrightConfigLabel(found, projectRoot) {
  const relative = path.relative(projectRoot, found.file).split(path.sep).join('/');
  return found.table === undefined ? relative : `${found.table} in ${relative}`;
}

export function environmentOf(config) {
  const environments = Array.isArray(config.executionEnvironments)
    ? config.executionEnvironments.map((environment) =>
        Object.fromEntries(
          ENVIRONMENT_ROOT_KEYS.filter((key) => environment[key] !== undefined).map((key) => [
            key,
            environment[key],
          ]),
        ),
      )
    : undefined;
  return Object.fromEntries(
    [
      ...ENVIRONMENT_KEYS.map((key) => [key, config[key]]),
      ['typeshedPath', config.typeshedPath],
      ['extraPaths', config.extraPaths],
      ['executionEnvironments', environments],
    ].filter(([, value]) => value !== undefined),
  );
}
