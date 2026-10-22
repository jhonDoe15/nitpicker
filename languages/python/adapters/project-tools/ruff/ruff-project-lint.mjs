import path from 'node:path';
import { isTable } from '../../configuration/project-files.mjs';

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
  'indent-width',
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
const CARRIED_GLOBALS = ['builtins', 'indent-width', 'line-length', 'preview', 'target-version'];
const PATH_GLOBALS = ['src', 'namespace-packages'];
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

function listOf(value) {
  return Array.isArray(value) ? value.filter((entry) => typeof entry === 'string') : [];
}

function lintView(table) {
  const legacy = Object.entries(table).filter(([key]) => !GLOBAL_KEYS.has(key));
  return { ...Object.fromEntries(legacy), ...(isTable(table.lint) ? table.lint : {}) };
}

function patternIn(directory, pattern) {
  const negated = pattern.startsWith('!');
  const body = negated ? pattern.slice(1) : pattern;
  const kept = !/[/\\]/u.test(body) || path.isAbsolute(body);
  return `${negated ? '!' : ''}${kept ? body : path.posix.join(directory, body)}`;
}

function pathIn(directory, entry) {
  return path.isAbsolute(entry) ? entry : path.posix.join(directory, entry);
}

function layerOf({ file, table }, { policyRoot, projectRoot }) {
  const offset = path.relative(policyRoot, path.dirname(file));
  const directory = path.resolve(projectRoot, offset).split(path.sep).join('/');
  const view = lintView(table);
  return { directory, table, view };
}

function selectionOf({ view }) {
  return {
    select: Array.isArray(view.select) ? listOf(view.select) : undefined,
    extendSelect: listOf(view['extend-select']),
    ignore: [...listOf(view.ignore), ...listOf(view['extend-ignore'])],
  };
}

function ignoresOf(table, directory) {
  return isTable(table)
    ? Object.entries(table).map(([pattern, selectors]) => ({
        pattern: patternIn(directory, pattern),
        selectors: listOf(selectors),
      }))
    : [];
}

function perFileIgnores(layers) {
  const owner = layers.findLast(({ view }) => view['per-file-ignores'] !== undefined);
  return [
    ...(owner === undefined ? [] : ignoresOf(owner.view['per-file-ignores'], owner.directory)),
    ...layers.flatMap(({ view, directory }) =>
      ignoresOf(view['extend-per-file-ignores'], directory),
    ),
  ];
}

function mergedTables(tables) {
  const merged = {};
  for (const table of tables) {
    for (const [key, value] of Object.entries(table)) {
      merged[key] =
        isTable(value) && isTable(merged[key]) ? mergedTables([merged[key], value]) : value;
    }
  }
  return merged;
}

function optionsOf(layers) {
  return mergedTables(
    layers.map(({ view }) =>
      Object.fromEntries(Object.entries(view).filter(([key]) => !DROPPED_LINT_KEYS.has(key))),
    ),
  );
}

function targetVersions(table, directory) {
  return isTable(table)
    ? Object.fromEntries(
        Object.entries(table).map(([pattern, version]) => [patternIn(directory, pattern), version]),
      )
    : undefined;
}

function globalsOf(layers) {
  const globals = {};
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

function patternsOf(layers, read) {
  return layers.flatMap((layer) =>
    listOf(read(layer)).map((pattern) => patternIn(layer.directory, pattern)),
  );
}

export function projectLint(chain, roots) {
  const layers = chain.toReversed().map((link) => layerOf(link, roots));
  const options = optionsOf(layers);
  const globals = globalsOf(layers);
  return {
    selection: layers.map(selectionOf),
    preview: {
      enabled: (options.preview ?? globals.preview) === true,
      explicit: options['explicit-preview-rules'] === true,
    },
    options,
    globals,
    perFileIgnores: perFileIgnores(layers),
    exclude: [
      ...patternsOf(layers, ({ table }) => table.exclude),
      ...patternsOf(layers, ({ table }) => table['extend-exclude']),
    ],
    lintExclude: patternsOf(layers, ({ view }) => view.exclude),
  };
}
