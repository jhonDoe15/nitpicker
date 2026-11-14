import { isTestFile, memoized, projectFiles, testRootOf, textOf } from '../project-tests.mjs';
import { codeOnly } from './code.mjs';
import { exportedNames, importsOf, isScript, reExportsOf } from './script-imports.mjs';

const MAX_DEPTH = 4;

function escaped(name) {
  return name.replaceAll(/[$.*+?^()[\]{}|\\]/gu, '\\$&');
}

/** 0 when the code of `test` calls `symbol` as a plain function, outside comments and strings. */
export function callRank(env, test, symbol) {
  if (symbol === undefined) {
    return 1;
  }
  const code = memoized(env, `code:${test}`, () => codeOnly(textOf(env, test)));
  return new RegExp(`(?<![\\w$.])${escaped(symbol)}\\s*\\(`, 'u').test(code) ? 0 : 1;
}

function edgesOf(env, name) {
  return [
    ...importsOf(env, name).map((entry) => ({ ...entry, from: name, reExport: false })),
    ...reExportsOf(env, name).map((entry) => ({ ...entry, from: name, reExport: true })),
  ];
}

function importersOf(env) {
  return memoized(env, 'importers', () =>
    Map.groupBy(
      projectFiles(env)
        .files.filter((name) => isScript(name))
        .flatMap((name) => edgesOf(env, name)),
      (edge) => edge.file,
    ),
  );
}

function carries(edge, names) {
  if (names === undefined) {
    return true;
  }
  return names.size > 0 && (edge.names === undefined || edge.names.some((name) => names.has(name)));
}

function reachedThrough(edge, names, env) {
  if (!edge.reExport) {
    return exportedNames(env, edge.from);
  }
  return edge.names === undefined
    ? names
    : new Set(edge.names.filter((name) => names?.has(name) ?? true));
}

function isHelper(file) {
  return !isTestFile(file) && testRootOf(file) !== undefined;
}

function stepFrom({ file, names }, env, seen) {
  return (importersOf(env).get(file) ?? [])
    .filter((edge) => !seen.has(edge.from) && !isHelper(edge.from) && carries(edge, names))
    .map((edge) => ({ file: edge.from, names: reachedThrough(edge, names, env) }));
}

function merged(a, b) {
  return a === undefined || b === undefined ? undefined : new Set([...a, ...b]);
}

function onePerFile(items) {
  return [...Map.groupBy(items, ({ file }) => file)].map(([file, group]) => ({
    file,
    names: group.slice(1).reduce((names, item) => merged(names, item.names), group[0].names),
  }));
}

function sharedFolders(test, file) {
  const folders = new Set(file.split('/').slice(0, -1));
  return test
    .split('/')
    .slice(0, -1)
    .filter((folder) => folders.has(folder)).length;
}

function compared(a, b, { env, symbol, file }) {
  return (
    callRank(env, a, symbol) - callRank(env, b, symbol) ||
    sharedFolders(b, file) - sharedFolders(a, file) ||
    a.localeCompare(b)
  );
}

function preferred(tests, target) {
  return tests.reduce((best, test) => (compared(test, best, target) < 0 ? test : best));
}

function search(start, target) {
  const levels = [start];
  for (const { frontier, seen, depth } of levels) {
    const next = onePerFile(frontier.flatMap((item) => stepFrom(item, target.env, seen)));
    const tests = next.map(({ file }) => file).filter((file) => isTestFile(file));
    if (tests.length > 0) {
      return preferred(tests, target);
    }
    if (next.length > 0 && depth < MAX_DEPTH) {
      const reached = new Set([...seen, ...next.map(({ file }) => file)]);
      levels.push({ frontier: next, seen: reached, depth: depth + 1 });
    }
  }
  return undefined;
}

/**
 * The test that reaches `file` through the fewest imports and re-exports. A re-export passes on
 * only its names; a module that exports nothing, or a helper under a test folder, ends the chain.
 * Ties go to a test that calls `symbol`, then to one sharing more folder names, then by path.
 */
export function testThroughImports(file, env, symbol) {
  return memoized(env, `chain:${file}:${symbol ?? ''}`, () =>
    search(
      { frontier: [{ file, names: exportedNames(env, file) }], seen: new Set([file]), depth: 1 },
      { env, symbol, file },
    ),
  );
}
