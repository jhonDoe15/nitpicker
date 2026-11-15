import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parseJsonc } from '../../../../../shared/jsonc/jsonc.mjs';
import {
  fieldOf,
  fieldsOf,
  messageOf,
  type Fields,
} from '../../../../../shared/values/readers.mts';
import { attempt, parseToml } from '../project-tool-layers.mts';
import type {
  ProjectPyright,
  PyrightChain,
  PyrightLink,
  PyrightOptions,
  PyrightRead,
  Rebase,
} from '../typed/pyright-types.mts';

export const PYRIGHT_JSON = 'pyrightconfig.json';
const PYPROJECT = 'pyproject.toml';
const EXTRA_PATHS = 'extraPaths';
const TABLES: Readonly<Record<string, readonly string[]>> = {
  pyright: ['pyright'],
  basedpyright: ['basedpyright', 'pyright'],
};
const ENVIRONMENT_PATH_KEYS = ['venvPath', 'typeshedPath'];
const SOURCE_PATH_KEYS = ['stubPath'];
const PATH_LIST_KEYS = [EXTRA_PATHS, 'include', 'exclude', 'ignore', 'strict'];
const ENVIRONMENT_KEYS = ['venv', 'venvPath', 'pythonVersion', 'pythonPlatform', 'stubPath'];
const ENVIRONMENT_ROOT_KEYS = ['root', EXTRA_PATHS, 'pythonVersion', 'pythonPlatform'];
const MAXIMUM_EXTENDS_DEPTH = 8;

function readTable(file: string, checker: string): PyrightRead | undefined {
  const tool = fieldsOf(parseToml(readFileSync(file, 'utf8'))['tool']);
  const name = (TABLES[checker] ?? []).find((candidate) => tool[candidate] !== undefined);
  return name === undefined ? undefined : { config: fieldsOf(tool[name]), table: `[tool.${name}]` };
}

function readFileConfig(file: string, checker: string): PyrightRead | undefined {
  if (path.basename(file) === PYPROJECT) {
    return readTable(file, checker);
  }
  const text = readFileSync(file, 'utf8');
  return { config: fieldsOf(file.endsWith('.toml') ? parseToml(text) : parseJsonc(text)) };
}

function absolute(directory: string, entry: unknown): unknown {
  return typeof entry === 'string' ? path.resolve(directory, entry) : entry;
}

function absolutized(
  config: Fields,
  { original, source }: { original: string; source: string },
): Fields {
  const result: Record<string, unknown> = { ...config };
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
    const entries = result[key];
    if (Array.isArray(entries)) {
      result[key] = entries.map((entry) => absolute(source, entry));
    }
  }
  if (result['venv'] !== undefined && result['venvPath'] === undefined) {
    result['venvPath'] = original;
  }
  const environments = result['executionEnvironments'];
  if (Array.isArray(environments)) {
    result['executionEnvironments'] = environments.map((environment) => {
      const extraPaths = fieldOf(environment, EXTRA_PATHS);
      return {
        ...fieldsOf(environment),
        root: absolute(source, fieldOf(environment, 'root') ?? '.'),
        ...(Array.isArray(extraPaths)
          ? { extraPaths: extraPaths.map((entry) => absolute(source, entry)) }
          : {}),
      };
    });
  }
  return result;
}

function parentOf(file: string, config: Fields): string | undefined {
  const extended = config['extends'];
  const parent =
    typeof extended === 'string' ? path.resolve(path.dirname(file), extended) : undefined;
  return parent !== undefined && existsSync(parent) ? parent : undefined;
}

function linkOf(file: string, read: PyrightRead, rebase: Rebase): PyrightLink {
  const original = path.dirname(file);
  const config = absolutized(read.config, { original, source: rebase(original) });
  return { file, table: read.table, config };
}

function chainOf(first: string, checker: string, rebase: Rebase): PyrightChain {
  const links: PyrightLink[] = [];
  const files: string[] = [];
  const pending = [first];
  for (const file of pending) {
    files.push(file);
    const { value: read, error } = attempt(() => readFileConfig(file, checker));
    if (error !== undefined || read === undefined) {
      return { links, files, unreadable: error === undefined ? undefined : messageOf(error) };
    }
    links.push(linkOf(file, read, rebase));
    const parent = parentOf(file, read.config);
    if (parent !== undefined && links.length <= MAXIMUM_EXTENDS_DEPTH) {
      pending.push(parent);
    }
  }
  return { links, files };
}

function hasMarker(directory: string): boolean {
  return existsSync(path.join(directory, '.git'));
}

function searchedDirectories(root: string): string[] {
  const parts = root.split(path.sep);
  const ancestors = parts.map(
    (_, index) => parts.slice(0, parts.length - index).join(path.sep) || path.sep,
  );
  const top = ancestors.findIndex(hasMarker);
  return top === -1 ? [root] : ancestors.slice(0, top + 1);
}

function locateIn(directory: string, checker: string): string | undefined {
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

function locate(directories: readonly string[], checker: string): string | undefined {
  return directories
    .map((directory) => locateIn(directory, checker))
    .find((file) => file !== undefined);
}

function rebaser(root: string, directories: readonly string[], projectRoot: string): Rebase {
  const ceiling = directories.at(-1) ?? root;
  return (directory) => {
    const relative = path.relative(ceiling, directory);
    const inside = relative === '' || !(relative.startsWith('..') || path.isAbsolute(relative));
    return inside ? path.join(projectRoot, path.relative(root, directory)) : directory;
  };
}

function loadProjectPyright(
  root: string,
  checker: string,
  options: PyrightOptions,
): ProjectPyright | undefined {
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
  const merged = Object.fromEntries(
    links.toReversed().flatMap((link) => Object.entries(link.config)),
  );
  return {
    file,
    files,
    table: links[0]?.table,
    config: Object.fromEntries(Object.entries(merged).filter(([key]) => key !== 'extends')),
  };
}

export function readProjectPyright(
  root: string,
  checker: string,
  options: PyrightOptions = { upward: false },
): ProjectPyright | undefined {
  return attempt(() => loadProjectPyright(root, checker, options)).value;
}

export function pyrightConfigLabel(found: ProjectPyright, projectRoot: string): string {
  const relative = path.relative(projectRoot, found.file).split(path.sep).join('/');
  return found.table === undefined ? relative : `${found.table} in ${relative}`;
}

export function environmentOf(config: Fields): Fields {
  const declared = config['executionEnvironments'];
  const environments = Array.isArray(declared)
    ? declared.map((environment) =>
        Object.fromEntries(
          ENVIRONMENT_ROOT_KEYS.filter((key) => fieldOf(environment, key) !== undefined).map(
            (key) => [key, fieldOf(environment, key)],
          ),
        ),
      )
    : undefined;
  const entries: [string, unknown][] = [
    ...ENVIRONMENT_KEYS.map((key): [string, unknown] => [key, config[key]]),
    ['typeshedPath', config['typeshedPath']],
    [EXTRA_PATHS, config[EXTRA_PATHS]],
    ['executionEnvironments', environments],
  ];
  return Object.fromEntries(entries.filter(([, value]) => value !== undefined));
}
