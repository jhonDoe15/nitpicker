import path from 'node:path';
import { importedModules, importEdges, longestKnownPrefix } from '../python-coupling.mjs';
import { EDGE_KINDS } from '../../../../../shared/rules/test-runtime/classify.mjs';
import { INIT } from './pytest/constants.mjs';
import { ancestorDirectories, createFixtureScope } from './pytest/fixture-reach.mjs';

const NO_FIXTURES = { files: [], unresolved: new Set(), marks: new Set() };

function importRootPrefix(file, packages) {
  const root = ancestorDirectories(file).find((directory) => !packages.has(directory)) ?? '.';
  return root === '.' ? '' : root.replaceAll('/', '.');
}

function underPrefix(statement, prefix) {
  return statement.module === null
    ? { ...statement, names: statement.names.map((name) => `${prefix}.${name}`) }
    : { ...statement, module: `${prefix}.${statement.module}` };
}

function resolvesBesideTest(entry, statement, { prefix, known }) {
  return importedModules(entry, statement, known).some(
    (target) => target?.startsWith(`${prefix}.`) === true,
  );
}

function siblingFirst(entry, statements, { prefix, known }) {
  return statements.flatMap((statement) => {
    if (statement.level !== 0) {
      return [statement];
    }
    return statement.names.map((name) => {
      const single = { ...statement, names: [name] };
      const beside = underPrefix(single, prefix);
      return resolvesBesideTest(entry, beside, { prefix, known }) ? beside : single;
    });
  });
}

function importsSeenByPytest(entries, imports) {
  const packages = new Set(
    entries
      .filter(({ file }) => path.posix.basename(file) === INIT)
      .map(({ file }) => path.posix.dirname(file)),
  );
  const known = new Set(entries.map(({ module }) => module));
  return {
    ...imports,
    ...Object.fromEntries(
      entries.flatMap((entry) => {
        const prefix = importRootPrefix(entry.file, packages);
        const statements = imports[entry.file];
        return prefix === '' || statements === undefined || entry.production
          ? []
          : [[entry.file, siblingFirst(entry, statements, { prefix, known })]];
      }),
    ),
  };
}

function namedEdges(others, literals, known) {
  return others.flatMap(({ file, module }) =>
    (literals[file]?.strings ?? []).flatMap((name) => {
      const target = longestKnownPrefix(name, known);
      return target === undefined
        ? []
        : [{ source: module, target, kind: EDGE_KINDS.RUNTIME, dynamic: true }];
    }),
  );
}

function runtimeTargets(bySource) {
  return new Map(
    [...bySource].map(([source, edges]) => [
      source,
      edges.filter(({ kind }) => kind === EDGE_KINDS.RUNTIME).map(({ target }) => target),
    ]),
  );
}

export function buildRuntimeGraph({
  modules,
  others = [],
  imports,
  literals = {},
  fixtureTests = [],
}) {
  const entries = [
    ...modules.map((entry) => ({ ...entry, production: true })),
    ...others.map((entry) => ({ ...entry, production: false })),
  ].map((entry) => ({ ...entry, isPackage: path.posix.basename(entry.file) === INIT }));
  const fileOf = new Map(entries.map(({ module, file }) => [module, file]).reverse());
  const known = new Set(fileOf.keys());
  const fileEdges = [
    ...importEdges(entries, importsSeenByPytest(entries, imports)),
    ...namedEdges(others, literals, known),
  ].map((edge) => ({
    ...edge,
    source: fileOf.get(edge.source),
    target: fileOf.get(edge.target),
  }));
  const bySource = Map.groupBy(fileEdges, ({ source }) => source);
  const importedFiles = runtimeTargets(bySource);
  const helpers = new Set(others.map(({ file }) => file));
  const reach = createFixtureScope({
    files: others.map(({ file }) => file),
    literals,
    fileOfModule: fileOf,
    importedFiles,
    isHelper: (file) => helpers.has(file),
  });
  const fixtures = new Map(fixtureTests.map((test) => [test, reach(test)]));
  return {
    fixtures: (test) => fixtures.get(test) ?? NO_FIXTURES,
    edges: new Map(
      entries.map(({ file }) => [
        file,
        [
          ...(bySource.get(file) ?? []),
          ...(fixtures.get(file)?.files ?? []).map((target) => ({
            target,
            kind: EDGE_KINDS.RUNTIME,
          })),
        ].map(({ target, kind, dynamic }) => ({ target, kind, dynamic })),
      ]),
    ),
  };
}
