import { existsSync, readFileSync } from 'node:fs';
import { toml } from '../../libraries/project-files.mts';
import path from 'node:path';
import { fieldOf, fieldsOf, listOf, messageOf } from '../../../../shared/values/readers.mts';
import { isTable, type TomlTable } from '../configuration/project-files.mts';
import type {
  BlackConfig,
  BlackScope,
  FormatSet,
  RuffConfig,
  RuffLayers,
  RuffScope,
  ScopePattern,
} from './format-types.mts';

const RUFF_FILES = ['.ruff.toml', 'ruff.toml', 'pyproject.toml'];
const PYPROJECT = 'pyproject.toml';

function parseToml(file: string): unknown {
  try {
    return toml().parse(readFileSync(file, 'utf8'));
  } catch (error) {
    throw Object.assign(
      new Error(`${file} is not valid TOML: ${messageOf(error)}`, { cause: error }),
      {
        file,
      },
    );
  }
}

function directoriesUp(start: string): string[] {
  const parts = path.resolve(start).split(path.sep);
  const ancestors = parts.map(
    (_, index) => parts.slice(0, parts.length - index).join(path.sep) || path.sep,
  );
  const root = ancestors.findIndex((directory) => existsSync(path.join(directory, '.git')));
  return root === -1 ? ancestors : ancestors.slice(0, root + 1);
}

function tableOrUndefined(value: unknown): TomlTable | undefined {
  return isTable(value) ? value : undefined;
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function isSetting(entry: readonly [string, unknown]): entry is [string, string | number] {
  return typeof entry[1] === 'string' || typeof entry[1] === 'number';
}

function ruffTable(file: string): TomlTable | undefined {
  const parsed = parseToml(file);
  return tableOrUndefined(
    path.basename(file) === PYPROJECT ? fieldOf(fieldOf(parsed, 'tool'), 'ruff') : parsed,
  );
}

function ruffSettings(table: TomlTable): FormatSet {
  const format = fieldsOf(table['format']);
  const indentation = format['indent-style'] === 'tab' ? 'tab' : table['indent-width'];
  return Object.fromEntries(
    Object.entries({
      lineLength: table['line-length'],
      quotes: format['quote-style'],
      indentation,
    }).filter(isSetting),
  );
}

function patternsOf(value: unknown, directory: string): ScopePattern[] | undefined {
  return Array.isArray(value)
    ? value
        .filter((pattern): pattern is string => typeof pattern === 'string')
        .map((pattern) => ({ pattern, directory }))
    : undefined;
}

function ruffScope(table: TomlTable, directory: string): RuffScope {
  return {
    exclude: patternsOf(table['exclude'], directory),
    extendExclude: patternsOf(table['extend-exclude'], directory) ?? [],
    forceExclude: table['force-exclude'],
    targetVersion: stringOrUndefined(table['target-version']),
  };
}

function firstDefined<Key extends keyof RuffScope>(
  scopes: readonly RuffScope[],
  key: Key,
): RuffScope[Key] | undefined {
  return scopes.map((scope) => scope[key]).find((value) => value !== undefined);
}

function mergedRuffScope(scopes: readonly RuffScope[]): RuffScope {
  return {
    exclude: firstDefined(scopes, 'exclude'),
    extendExclude: scopes.flatMap((scope) => scope.extendExclude),
    forceExclude: firstDefined(scopes, 'forceExclude'),
    targetVersion: firstDefined(scopes, 'targetVersion'),
  };
}

function extendedFile(file: string, table: TomlTable): string | undefined {
  const extend = table['extend'];
  return typeof extend === 'string' ? path.resolve(path.dirname(file), extend) : undefined;
}

function extensionChain(file: string): string[] {
  const queue = [file];
  const queued = new Set(queue);
  for (const current of queue) {
    const table = ruffTable(current);
    const parent = table === undefined ? undefined : extendedFile(current, table);
    if (parent !== undefined && existsSync(parent) && !queued.has(parent)) {
      queue.push(parent);
      queued.add(parent);
    }
  }
  return queue;
}

function ruffConfigOf(file: string): RuffConfig {
  const files = extensionChain(file);
  const tables = files.flatMap((current) => {
    const table = ruffTable(current);
    return table === undefined ? [] : [[current, table] as const];
  });
  return {
    file,
    files,
    set: Object.fromEntries(
      tables.toReversed().flatMap(([, table]) => Object.entries(ruffSettings(table))),
    ),
    scope: mergedRuffScope(
      tables.map(([current, table]) => ruffScope(table, path.dirname(current))),
    ),
  };
}

export function readRuffConfig(start: string): RuffConfig | undefined {
  const file = directoriesUp(start)
    .flatMap((directory) => RUFF_FILES.map((name) => path.join(directory, name)))
    .find((candidate) => existsSync(candidate) && ruffTable(candidate) !== undefined);
  return file === undefined ? undefined : ruffConfigOf(file);
}

export function readRuffLayers(start: string): RuffLayers | undefined {
  const config = readRuffConfig(start);
  if (config === undefined) {
    return undefined;
  }
  const layers = config.files.flatMap((file) => {
    const table = ruffTable(file);
    return table === undefined ? [] : [{ file, table }];
  });
  return { ...config, layers };
}

const BLACK_QUOTES: Readonly<Record<string, string>> = { true: 'preserve', false: 'normalize' };

function blackKey(table: TomlTable, name: string): unknown {
  return table[name] ?? table[name.replaceAll('-', '_')];
}

function blackSettings(table: TomlTable): FormatSet {
  return Object.fromEntries(
    Object.entries({
      lineLength: blackKey(table, 'line-length'),
      quotes: BLACK_QUOTES[String(blackKey(table, 'skip-string-normalization'))],
    }).filter(isSetting),
  );
}

function blackTable(parsed: unknown): TomlTable | undefined {
  return tableOrUndefined(fieldOf(fieldOf(parsed, 'tool'), 'black'));
}

function blackScope(parsed: unknown): BlackScope {
  const table = blackTable(parsed) ?? {};
  const targetVersions = blackKey(table, 'target-version');
  return {
    exclude: stringOrUndefined(blackKey(table, 'exclude')),
    extendExclude: stringOrUndefined(blackKey(table, 'extend-exclude')),
    forceExclude: stringOrUndefined(blackKey(table, 'force-exclude')),
    targetVersions: Array.isArray(targetVersions) ? listOf(targetVersions).map(String) : undefined,
    requiresPython: fieldOf(fieldOf(parsed, 'project'), 'requires-python') !== undefined,
  };
}

export function readBlackConfig(start: string): BlackConfig | undefined {
  const file = directoriesUp(start)
    .map((directory) => path.join(directory, PYPROJECT))
    .find((candidate) => existsSync(candidate));
  if (file === undefined) {
    return undefined;
  }
  const parsed = parseToml(file);
  return {
    file,
    files: [file],
    hasTable: blackTable(parsed) !== undefined,
    set: blackSettings(blackTable(parsed) ?? {}),
    scope: blackScope(parsed),
  };
}

function existingCandidates(start: string, names: readonly string[]): string[] {
  return directoriesUp(start)
    .flatMap((directory) => names.map((name) => path.join(directory, name)))
    .filter((candidate) => existsSync(candidate));
}

function filesOf(
  read: (start: string) => { readonly files: string[] } | undefined,
  start: string,
  names: readonly string[],
): string[] {
  try {
    return read(start)?.files ?? [];
  } catch (error) {
    const file = fieldOf(error, 'file');
    return [...existingCandidates(start, names), ...(typeof file === 'string' ? [file] : [])];
  }
}

export function ruffConfigFiles(start: string): string[] {
  return filesOf(readRuffConfig, start, RUFF_FILES);
}

export function blackConfigFiles(start: string): string[] {
  return filesOf(readBlackConfig, start, [PYPROJECT]);
}

export function projectFormatConfigFiles(start: string): string[] {
  return [...new Set([...ruffConfigFiles(start), ...blackConfigFiles(start)])];
}
