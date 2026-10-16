import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const RUFF_FILES = ['.ruff.toml', 'ruff.toml', 'pyproject.toml'];
const PYPROJECT = 'pyproject.toml';

function parseToml(file) {
  try {
    return createRequire(import.meta.url)('smol-toml').parse(readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(`${file} is not valid TOML: ${error.message}`, { cause: error });
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

function ruffSettingsOf(file) {
  return extensionChain(file)
    .toReversed()
    .reduce((merged, current) => {
      const table = ruffTable(current);
      return table === undefined ? merged : { ...merged, ...ruffSettings(table) };
    }, {});
}

export function readRuffConfig(start) {
  const file = directoriesUp(start)
    .flatMap((directory) => RUFF_FILES.map((name) => path.join(directory, name)))
    .find((candidate) => existsSync(candidate) && ruffTable(candidate) !== undefined);
  return file === undefined ? undefined : { file, set: ruffSettingsOf(file) };
}

function blackSettings(table) {
  const normalization = table['skip-string-normalization'] ?? table.skip_string_normalization;
  const lineLength = table['line-length'] ?? table.line_length;
  return Object.fromEntries(
    Object.entries({
      lineLength,
      quotes: normalization === undefined ? undefined : normalization ? 'preserve' : 'normalize',
    }).filter(([, value]) => value !== undefined),
  );
}

export function readBlackConfig(start) {
  const file = directoriesUp(start)
    .map((directory) => path.join(directory, PYPROJECT))
    .find((candidate) => existsSync(candidate) && parseToml(candidate).tool?.black !== undefined);
  return file === undefined ? undefined : { file, set: blackSettings(parseToml(file).tool.black) };
}
