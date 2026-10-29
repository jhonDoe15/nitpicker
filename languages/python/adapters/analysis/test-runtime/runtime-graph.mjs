import path from 'node:path';
import { importEdges, longestKnownPrefix } from '../python-coupling.mjs';

const CONFTEST = 'conftest.py';
const INIT = '__init__.py';
const RUNTIME = 'runtime';

function ancestorDirectories(file) {
  const parts = path.posix.dirname(file).split('/');
  return parts[0] === '.'
    ? ['.']
    : [...parts.map((_, index) => parts.slice(0, parts.length - index).join('/')), '.'];
}

function importRootPrefix(file, packages) {
  const root = ancestorDirectories(file).find((directory) => !packages.has(directory)) ?? '.';
  return root === '.' ? '' : root.replaceAll('/', '.');
}

function underPrefix(statement, prefix) {
  return statement.module === null
    ? { ...statement, names: statement.names.map((name) => `${prefix}.${name}`) }
    : { ...statement, module: `${prefix}.${statement.module}` };
}

function flatImports(others, imports, packages) {
  return Object.fromEntries(
    others.map(({ file }) => {
      const prefix = importRootPrefix(file, packages);
      const statements = prefix === '' ? [] : (imports[file] ?? []);
      return [
        file,
        statements
          .filter(({ level }) => level === 0)
          .map((statement) => underPrefix(statement, prefix)),
      ];
    }),
  );
}

function statementEdges({ entries, others, imports }) {
  const packages = new Set(
    entries
      .filter(({ file }) => path.posix.basename(file) === INIT)
      .map(({ file }) => path.posix.dirname(file)),
  );
  return [
    ...importEdges(entries, imports),
    ...importEdges(entries, flatImports(others, imports, packages)),
  ];
}

function namedEdges(others, literals, known) {
  return others.flatMap(({ file, module }) => {
    const { strings = [], plugins = [] } = literals[file] ?? {};
    return [...strings, ...plugins].flatMap((name) => {
      const target = longestKnownPrefix(name, known);
      return target === undefined ? [] : [{ source: module, target, kind: RUNTIME, dynamic: true }];
    });
  });
}

function conftestEdges(others) {
  const conftests = new Map(
    others
      .filter(({ file }) => path.posix.basename(file) === CONFTEST)
      .map(({ file }) => [path.posix.dirname(file), file]),
  );
  return others
    .filter(({ kind, file }) => kind === 'test' && path.posix.basename(file) !== CONFTEST)
    .flatMap(({ file }) =>
      ancestorDirectories(file)
        .filter((directory) => conftests.has(directory))
        .map((directory) => ({ source: file, target: conftests.get(directory), kind: RUNTIME })),
    );
}

export function buildRuntimeGraph({ modules, others = [], imports, literals = {}, loadsConftest }) {
  const entries = [...modules, ...others].map((entry) => ({
    ...entry,
    isPackage: path.posix.basename(entry.file) === INIT,
  }));
  const fileOf = new Map(entries.map(({ module, file }) => [module, file]).reverse());
  const known = new Set(fileOf.keys());
  const fileEdges = [
    ...statementEdges({ entries, others, imports }),
    ...namedEdges(others, literals, known),
  ].map((edge) => ({
    ...edge,
    source: fileOf.get(edge.source),
    target: fileOf.get(edge.target),
  }));
  const bySource = Map.groupBy(
    [...fileEdges, ...(loadsConftest ? conftestEdges(others) : [])],
    ({ source }) => source,
  );
  return new Map(
    entries.map(({ file }) => [
      file,
      (bySource.get(file) ?? []).map(({ target, kind, dynamic }) => ({ target, kind, dynamic })),
    ]),
  );
}
