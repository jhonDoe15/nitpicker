import { goConsoleFacts } from '../tests/test-console.mjs';
import { directoryOf, goPackages } from './go-packages.mjs';

const DOT_IMPORT = '.';

function scopeKey(directory, name) {
  return `${directory}\0${name}`;
}

function definitionIndex(report) {
  const packageOf = new Map(report.files.map((file) => [file.path, file.package]));
  const index = new Map();
  for (const definition of report.definitions) {
    const key = scopeKey(directoryOf(definition.file), packageOf.get(definition.file));
    const names = index.get(key) ?? new Map();
    names.set(definition.name, [...(names.get(definition.name) ?? []), definition.file]);
    index.set(key, names);
  }
  return { packageOf, filesDefining: (key, name) => index.get(key)?.get(name) ?? [] };
}

function importedScopes(usage, packages) {
  return usage.imports.flatMap(({ path: importPath, name }) => {
    const directory = packages.directoryOfImport(importPath);
    const packageName = directory === undefined ? undefined : packages.nameOf(directory);
    return packageName === undefined
      ? []
      : [[name === '' ? packageName : name, scopeKey(directory, packageName)]];
  });
}

function addEdge(edges, { from, to, name }) {
  const key = `${from}\0${to}`;
  const edge = edges.get(key) ?? { from, to, names: new Set() };
  if (name !== undefined) {
    edge.names.add(name);
  }
  edges.set(key, edge);
}

function nameTargets(usage, { index, own, dotted }) {
  return usage.names.flatMap((name) =>
    [own, ...dotted].flatMap((key) =>
      index
        .filesDefining(key, name)
        .filter((file) => file !== usage.file)
        .map((to) => ({ key, name, to })),
    ),
  );
}

function selectorTargets(usage, { index, named }) {
  return usage.selectors.flatMap(({ qualifier, name }) => {
    const key = named.get(qualifier);
    return key === undefined ? [] : index.filesDefining(key, name).map((to) => ({ key, name, to }));
  });
}

function usageEdges(usage, { index, packages, edges }) {
  const from = usage.file;
  const own = scopeKey(directoryOf(from), index.packageOf.get(from));
  const scopes = importedScopes(usage, packages);
  const named = new Map(scopes.filter(([alias]) => alias !== DOT_IMPORT));
  const dotted = scopes.filter(([alias]) => alias === DOT_IMPORT).map(([, key]) => key);
  const targets = [
    ...nameTargets(usage, { index, own, dotted }),
    ...selectorTargets(usage, { index, named }),
  ];
  for (const { name, to } of targets) {
    addEdge(edges, { from, to, name });
  }
  for (const name of usage.local) {
    addEdge(edges, { from, to: from, name });
  }
  const reached = new Set(targets.map(({ key }) => key));
  return [...new Set(scopes.map(([, key]) => key))].filter((key) => !reached.has(key));
}

function packageWideEdges(keys, { from, report, index, edges }) {
  const files = report.files.filter(({ test }) => !test);
  for (const key of keys) {
    for (const file of files.filter(
      ({ path: to }) => scopeKey(directoryOf(to), index.packageOf.get(to)) === key,
    )) {
      addEdge(edges, { from, to: file.path });
    }
  }
}

function importFacts(report, packages, roleOf) {
  const index = definitionIndex(report);
  const edges = new Map();
  for (const usage of report.usages) {
    const unreached = usageEdges(usage, { index, packages, edges });
    packageWideEdges(unreached, { from: usage.file, report, index, edges });
  }
  return [...edges.values()].map(({ from, to, names }) => ({
    from,
    to,
    names: [...names]
      .toSorted((left, right) => left.localeCompare(right))
      .map((name) => ({ name })),
    role: roleOf(from),
  }));
}

function productionUses(imports) {
  const uses = new Map();
  for (const { to, names } of imports.filter((edge) => edge.role === 'production')) {
    uses.set(to, new Set([...(uses.get(to) ?? []), ...names.map(({ name }) => name)]));
  }
  return uses;
}

function definitionFacts(report, uses) {
  return report.definitions.map(
    ({ file, name, kind, line, lines, exported, entry, literal, tokens }) => ({
      file,
      name,
      kind,
      line,
      lines,
      exported,
      entry,
      literal,
      tokens,
      usedLocally: uses.get(file)?.has(name) ?? false,
    }),
  );
}

export function goFacts(report, { module = '', testRun } = {}) {
  const packages = goPackages(report, module);
  const roles = new Map(report.files.map((file) => [file.path, file.test ? 'test' : 'production']));
  function roleOf(file) {
    return roles.get(file) ?? 'production';
  }
  const imports = importFacts(report, packages, roleOf);
  return {
    modules: report.files.map(({ path: file }) => ({ file, role: roleOf(file), entry: true })),
    packages: packages.directories.map((root) => ({ root, published: packages.isPublished(root) })),
    definitions: definitionFacts(report, productionUses(imports)),
    imports,
    docComments: report.docComments ?? [],
    console: testRun === undefined ? [] : goConsoleFacts(testRun, { report, module }),
    constrained: report.files
      .filter(({ constrained }) => constrained)
      .map(({ path: file }) => file),
  };
}
