import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parseJsonc } from '../../../../../shared/jsonc.mjs';
import { parseToml } from '../project-tool-layers.mjs';

export const PYRIGHT_JSON = 'pyrightconfig.json';
const PYPROJECT = 'pyproject.toml';
const TABLES = { pyright: ['pyright'], basedpyright: ['basedpyright', 'pyright'] };
const PATH_KEYS = ['venvPath', 'stubPath', 'typeshedPath'];
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

function absolutized(config, directory) {
  const result = { ...config };
  for (const key of PATH_KEYS) {
    if (result[key] !== undefined) {
      result[key] = absolute(directory, result[key]);
    }
  }
  for (const key of PATH_LIST_KEYS) {
    if (Array.isArray(result[key])) {
      result[key] = result[key].map((entry) => absolute(directory, entry));
    }
  }
  if (result.venv !== undefined && result.venvPath === undefined) {
    result.venvPath = directory;
  }
  if (Array.isArray(result.executionEnvironments)) {
    result.executionEnvironments = result.executionEnvironments.map((environment) => ({
      ...environment,
      root: absolute(directory, environment.root ?? '.'),
      ...(Array.isArray(environment.extraPaths)
        ? { extraPaths: environment.extraPaths.map((entry) => absolute(directory, entry)) }
        : {}),
    }));
  }
  return result;
}

function chainOf(file, checker, depth = 0) {
  const read = readFileConfig(file, checker);
  if (read === undefined) {
    return [];
  }
  const directory = path.dirname(file);
  const own = absolutized(read.config, directory);
  const parent =
    typeof read.config.extends === 'string'
      ? path.resolve(directory, read.config.extends)
      : undefined;
  const inherited =
    parent !== undefined && depth < MAXIMUM_EXTENDS_DEPTH && existsSync(parent)
      ? chainOf(parent, checker, depth + 1)
      : [];
  return [{ file, table: read.table, config: own }, ...inherited];
}

function locate(projectRoot, checker) {
  const json = path.join(projectRoot, PYRIGHT_JSON);
  if (existsSync(json)) {
    return json;
  }
  const pyproject = path.join(projectRoot, PYPROJECT);
  return existsSync(pyproject) && readTable(pyproject, checker) !== undefined
    ? pyproject
    : undefined;
}

export function readProjectPyright(projectRoot, checker) {
  try {
    const file = locate(projectRoot, checker);
    if (file === undefined) {
      return undefined;
    }
    const chain = chainOf(file, checker);
    const merged = Object.assign({}, ...chain.toReversed().map((link) => link.config));
    return {
      file,
      files: chain.map((link) => link.file),
      table: chain[0].table,
      config: Object.fromEntries(Object.entries(merged).filter(([key]) => key !== 'extends')),
    };
  } catch {
    return undefined;
  }
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
