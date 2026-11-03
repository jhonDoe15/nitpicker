import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const RUFF_FILES = ['.ruff.toml', 'ruff.toml', 'pyproject.toml'];
const PYPROJECT = 'pyproject.toml';

function parseToml(file) {
  try {
    return createRequire(import.meta.url)('smol-toml').parse(readFileSync(file, 'utf8'));
  } catch (error) {
    throw Object.assign(
      new Error(`${file} is not valid TOML: ${error.message}`, { cause: error }),
      {
        file,
      },
    );
  }
}

function directoriesUp(start) {
  const parts = path.resolve(start).split(path.sep);
  const ancestors = parts.map(
    (_, index) => parts.slice(0, parts.length - index).join(path.sep) || path.sep,
  );
  const root = ancestors.findIndex((directory) => existsSync(path.join(directory, '.git')));
  return root === -1 ? ancestors : ancestors.slice(0, root + 1);
}

function ruffTable(file) {
  const parsed = parseToml(file);
  return path.basename(file) === PYPROJECT ? parsed.tool?.ruff : parsed;
}

function ruffSettings(table) {
  const format = table.format ?? {};
  const indentation = format['indent-style'] === 'tab' ? 'tab' : table['indent-width'];
  return Object.fromEntries(
    Object.entries({
      lineLength: table['line-length'],
      quotes: format['quote-style'],
      indentation,
    }).filter(([, value]) => value !== undefined),
  );
}

function patternsOf(value, directory) {
  return Array.isArray(value)
    ? value
        .filter((pattern) => typeof pattern === 'string')
        .map((pattern) => ({ pattern, directory }))
    : undefined;
}

function ruffScope(table, directory) {
  return {
    exclude: patternsOf(table.exclude, directory),
    extendExclude: patternsOf(table['extend-exclude'], directory) ?? [],
    forceExclude: table['force-exclude'],
    targetVersion: table['target-version'],
  };
}

function firstDefined(scopes, key) {
  return scopes.map((scope) => scope[key]).find((value) => value !== undefined);
}

function mergedRuffScope(scopes) {
  return {
    exclude: firstDefined(scopes, 'exclude'),
    extendExclude: scopes.flatMap((scope) => scope.extendExclude),
    forceExclude: firstDefined(scopes, 'forceExclude'),
    targetVersion: firstDefined(scopes, 'targetVersion'),
  };
}

function extendedFile(file, table) {
  return typeof table.extend === 'string'
    ? path.resolve(path.dirname(file), table.extend)
    : undefined;
}

function extensionChain(file) {
  const queue = [file];
  for (const current of queue) {
    const table = ruffTable(current);
    const parent = table === undefined ? undefined : extendedFile(current, table);
    if (parent !== undefined && existsSync(parent) && !queue.includes(parent)) {
      queue.push(parent);
    }
  }
  return queue;
}

function ruffConfigOf(file) {
  const files = extensionChain(file);
  const tables = files
    .map((current) => [current, ruffTable(current)])
    .filter(([, table]) => table !== undefined);
  return {
    file,
    files,
    set: Object.assign({}, ...tables.toReversed().map(([, table]) => ruffSettings(table))),
    scope: mergedRuffScope(
      tables.map(([current, table]) => ruffScope(table, path.dirname(current))),
    ),
  };
}

export function readRuffConfig(start) {
  const file = directoriesUp(start)
    .flatMap((directory) => RUFF_FILES.map((name) => path.join(directory, name)))
    .find((candidate) => existsSync(candidate) && ruffTable(candidate) !== undefined);
  return file === undefined ? undefined : ruffConfigOf(file);
}

export function readRuffLayers(start) {
  const config = readRuffConfig(start);
  if (config === undefined) {
    return undefined;
  }
  const layers = config.files.map((file) => ({ file, table: ruffTable(file) }));
  return { ...config, layers: layers.filter(({ table }) => table !== undefined) };
}

const BLACK_QUOTES = { true: 'preserve', false: 'normalize' };

function blackKey(table, name) {
  return table[name] ?? table[name.replaceAll('-', '_')];
}

function blackSettings(table) {
  return Object.fromEntries(
    Object.entries({
      lineLength: blackKey(table, 'line-length'),
      quotes: BLACK_QUOTES[blackKey(table, 'skip-string-normalization')],
    }).filter(([, value]) => value !== undefined),
  );
}

function blackScope(parsed) {
  const table = parsed.tool?.black ?? {};
  return {
    exclude: blackKey(table, 'exclude'),
    extendExclude: blackKey(table, 'extend-exclude'),
    forceExclude: blackKey(table, 'force-exclude'),
    targetVersions: blackKey(table, 'target-version'),
    requiresPython: parsed.project?.['requires-python'] !== undefined,
  };
}

export function readBlackConfig(start) {
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
    hasTable: parsed.tool?.black !== undefined,
    set: blackSettings(parsed.tool?.black ?? {}),
    scope: blackScope(parsed),
  };
}

function existingCandidates(start, names) {
  return directoriesUp(start)
    .flatMap((directory) => names.map((name) => path.join(directory, name)))
    .filter((candidate) => existsSync(candidate));
}

function filesOf(read, start, names) {
  try {
    return read(start)?.files ?? [];
  } catch (error) {
    return [...existingCandidates(start, names), ...(error.file === undefined ? [] : [error.file])];
  }
}

export function ruffConfigFiles(start) {
  return filesOf(readRuffConfig, start, RUFF_FILES);
}

export function blackConfigFiles(start) {
  return filesOf(readBlackConfig, start, [PYPROJECT]);
}

export function projectFormatConfigFiles(start) {
  return [...new Set([...ruffConfigFiles(start), ...blackConfigFiles(start)])];
}
