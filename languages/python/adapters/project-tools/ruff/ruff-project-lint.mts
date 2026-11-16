import path from 'node:path';
import { listOf as itemsOf, type Fields } from '../../../../../shared/values/readers.mts';
import type { RuffLayer, RuffProject } from '../typed/ruff-types.mts';
import { isTable } from '../../configuration/project-files.mts';

const INDENT_WIDTH = 'indent-width';
const GLOBAL_KEYS = new Set([
  'analyze',
  'builtins',
  'cache-dir',
  'exclude',
  'extend',
  'extend-exclude',
  'extend-include',
  'fix',
  'fix-only',
  'force-exclude',
  'format',
  'include',
  INDENT_WIDTH,
  'line-length',
  'lint',
  'namespace-packages',
  'output-format',
  'per-file-target-version',
  'preview',
  'required-version',
  'respect-gitignore',
  'show-fixes',
  'src',
  'target-version',
  'unsafe-fixes',
]);
const CARRIED_GLOBALS = ['builtins', INDENT_WIDTH, 'line-length', 'preview', 'target-version'];
const PATH_GLOBALS = ['src', 'namespace-packages'];
const LAYOUT_GLOBALS = new Set([...PATH_GLOBALS, INDENT_WIDTH]);
const DROPPED_LINT_KEYS = new Set([
  'select',
  'extend-select',
  'ignore',
  'extend-ignore',
  'per-file-ignores',
  'extend-per-file-ignores',
  'exclude',
  'fixable',
  'unfixable',
  'extend-fixable',
  'extend-safe-fixes',
  'extend-unsafe-fixes',
]);

type Layer = { directory: string; table: Fields; view: Fields };
type MergeLevel = { target: Record<string, unknown>; winner: Fields; other: Fields };

function listOf(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

function lintView(table: Fields): Fields {
  const lint = table['lint'];
  const legacy = Object.entries(table).filter(([key]) => !GLOBAL_KEYS.has(key));
  return { ...Object.fromEntries(legacy), ...(isTable(lint) ? lint : {}) };
}

function patternIn(directory: string, pattern: string): string {
  const negated = pattern.startsWith('!');
  const body = negated ? pattern.slice(1) : pattern;
  const kept = !/[/\\]/u.test(body) || path.isAbsolute(body);
  return `${negated ? '!' : ''}${kept ? body : path.posix.join(directory, body)}`;
}

function pathIn(directory: string, entry: string): string {
  return path.isAbsolute(entry) ? entry : path.posix.join(directory, entry);
}

function layerOf(
  { file, table }: RuffLayer,
  { policyRoot, projectRoot }: { policyRoot: string; projectRoot: string },
): Layer {
  const offset = path.relative(policyRoot, path.dirname(file));
  const directory = path.resolve(projectRoot, offset).split(path.sep).join('/');
  const view = lintView(table);
  return { directory, table, view };
}

function mergedValue(value: unknown, current: unknown, joinLists: boolean): unknown {
  return joinLists && Array.isArray(value) && Array.isArray(current)
    ? [...new Set([...itemsOf(current), ...itemsOf(value)])]
    : value;
}

function mergeLevel(
  { target, winner, other }: MergeLevel,
  { joinLists, pending }: { joinLists: boolean; pending: MergeLevel[] },
): void {
  for (const [key, value] of Object.entries(winner)) {
    const current = other[key];
    if (isTable(value) && isTable(current)) {
      const next = { ...current };
      target[key] = next;
      pending.push({ target: next, winner: value, other: current });
    } else {
      target[key] = mergedValue(value, current, joinLists);
    }
  }
}

export function mergeTables(
  winner: Fields,
  other: Fields,
  { joinLists }: { joinLists: boolean },
): Fields {
  const merged = { ...other };
  const pending: MergeLevel[] = [{ target: merged, winner, other }];
  for (const level of pending) {
    mergeLevel(level, { joinLists, pending });
  }
  return merged;
}

function mergedTables(tables: Fields[]): Fields {
  return tables.reduce<Fields>(
    (merged, table) => mergeTables(table, merged, { joinLists: false }),
    {},
  );
}

function optionsOf(layers: Layer[]): Fields {
  return mergedTables(
    layers.map(({ view }) =>
      Object.fromEntries(Object.entries(view).filter(([key]) => !DROPPED_LINT_KEYS.has(key))),
    ),
  );
}

function targetVersions(table: unknown, directory: string): Fields | undefined {
  return isTable(table)
    ? Object.fromEntries(
        Object.entries(table).map(([pattern, version]) => [patternIn(directory, pattern), version]),
      )
    : undefined;
}

function globalsOf(layers: Layer[]): Fields {
  const globals: Record<string, unknown> = {};
  for (const { table, directory } of layers) {
    for (const key of CARRIED_GLOBALS.filter((name) => table[name] !== undefined)) {
      globals[key] = table[key];
    }
    for (const key of PATH_GLOBALS.filter((name) => Array.isArray(table[name]))) {
      globals[key] = listOf(table[key]).map((entry) => pathIn(directory, entry));
    }
    const versions = targetVersions(table['per-file-target-version'], directory);
    if (versions !== undefined) {
      globals['per-file-target-version'] = versions;
    }
  }
  return globals;
}

function patternsOf(layers: Layer[], read: (layer: Layer) => unknown): string[] {
  return layers.flatMap((layer) =>
    listOf(read(layer)).map((pattern) => patternIn(layer.directory, pattern)),
  );
}

export function layoutGlobals(globals: Fields): Fields {
  return Object.fromEntries(Object.entries(globals).filter(([key]) => LAYOUT_GLOBALS.has(key)));
}

export function projectLint(
  chain: RuffLayer[],
  roots: { policyRoot: string; projectRoot: string },
): RuffProject {
  const layers = chain.toReversed().map((link) => layerOf(link, roots));
  return {
    options: optionsOf(layers),
    globals: globalsOf(layers),
    exclude: [
      ...patternsOf(layers, ({ table }) => table['exclude']),
      ...patternsOf(layers, ({ table }) => table['extend-exclude']),
    ],
    lintExclude: patternsOf(layers, ({ view }) => view['exclude']),
  };
}
