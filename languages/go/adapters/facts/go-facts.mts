import { goConsoleFacts } from '../tests/test-console.mts';
import { goDesignFacts } from './go-design-facts.mts';
import { directoryOf, goPackages } from '../typed/go-readers.mts';
import type {
  GoFacts,
  GoFactRole,
  GoImportFact,
  GoPackages,
  GoUsage,
  InspectReport,
  NamedTests,
  TestRun,
} from '../go-types.mts';

type FactsReport = Pick<InspectReport, 'files' | 'definitions' | 'usages'> &
  Partial<Pick<InspectReport, 'design' | 'docComments'>> &
  Partial<NamedTests>;
type Edge = { from: string; to: string; names: Set<string> };
type Edges = Map<string, Edge>;
type DefinitionIndex = ReturnType<typeof definitionIndex>;

const DOT_IMPORT = '.';
const PRODUCTION = 'production';

function scopeKey(directory: string, name: string | undefined) {
  return `${directory}\0${String(name)}`;
}

function definitionIndex(report: Pick<InspectReport, 'files' | 'definitions'>) {
  const packageOf = new Map(report.files.map((file) => [file.path, file.package]));
  const index = new Map<string, Map<string, string[]>>();
  for (const definition of report.definitions) {
    const key = scopeKey(directoryOf(definition.file), packageOf.get(definition.file));
    const names = index.get(key) ?? new Map<string, string[]>();
    names.set(definition.name, [...(names.get(definition.name) ?? []), definition.file]);
    index.set(key, names);
  }
  return {
    packageOf,
    filesDefining: (key: string, name: string) => index.get(key)?.get(name) ?? [],
  };
}

function importedScopes(usage: GoUsage, packages: GoPackages): [string, string][] {
  return usage.imports.flatMap(({ path: importPath, name }) => {
    const directory = packages.directoryOfImport(importPath);
    const packageName = directory === undefined ? undefined : packages.nameOf(directory);
    return directory === undefined || packageName === undefined
      ? []
      : [[name === '' ? packageName : name, scopeKey(directory, packageName)]];
  });
}

function addEdge(edges: Edges, { from, to, name }: { from: string; to: string; name?: string }) {
  const key = `${from}\0${to}`;
  const edge = edges.get(key) ?? { from, to, names: new Set() };
  if (name !== undefined) {
    edge.names.add(name);
  }
  edges.set(key, edge);
}

function nameTargets(
  usage: GoUsage,
  { index, own, dotted }: { index: DefinitionIndex; own: string; dotted: readonly string[] },
) {
  return usage.names.flatMap((name) =>
    [own, ...dotted].flatMap((key) =>
      index
        .filesDefining(key, name)
        .filter((file) => file !== usage.file)
        .map((to) => ({ key, name, to })),
    ),
  );
}

function selectorTargets(
  usage: GoUsage,
  { index, named }: { index: DefinitionIndex; named: ReadonlyMap<string, string> },
) {
  return usage.selectors.flatMap(({ qualifier, name }) => {
    const key = named.get(qualifier);
    return key === undefined ? [] : index.filesDefining(key, name).map((to) => ({ key, name, to }));
  });
}

function usageEdges(
  usage: GoUsage,
  { index, packages, edges }: { index: DefinitionIndex; packages: GoPackages; edges: Edges },
) {
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

function packageWideEdges(
  keys: readonly string[],
  {
    from,
    report,
    index,
    edges,
  }: { from: string; report: FactsReport; index: DefinitionIndex; edges: Edges },
) {
  const files = report.files.filter(({ test }) => !test);
  for (const key of keys) {
    for (const file of files.filter(
      ({ path: to }) => scopeKey(directoryOf(to), index.packageOf.get(to)) === key,
    )) {
      addEdge(edges, { from, to: file.path });
    }
  }
}

function importFacts(
  report: FactsReport,
  packages: GoPackages,
  roleOf: (file: string) => GoFactRole,
): GoImportFact[] {
  const index = definitionIndex(report);
  const edges: Edges = new Map();
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

function productionUses(imports: readonly GoImportFact[]) {
  const uses = new Map<string, Set<string>>();
  for (const { to, names } of imports.filter((edge) => edge.role === PRODUCTION)) {
    uses.set(to, new Set([...(uses.get(to) ?? []), ...names.map(({ name }) => name)]));
  }
  return uses;
}

function definitionFacts(
  report: FactsReport,
  uses: ReadonlyMap<string, ReadonlySet<string>>,
): GoFacts['definitions'] {
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

export function goFacts(
  report: FactsReport,
  { module = '', testRun }: { module?: string; testRun?: Pick<TestRun, 'outputs'> } = {},
): GoFacts {
  const packages = goPackages(report, module);
  const roles = new Map<string, GoFactRole>(
    report.files.map((file) => [file.path, file.test ? 'test' : PRODUCTION]),
  );
  function roleOf(file: string): GoFactRole {
    return roles.get(file) ?? PRODUCTION;
  }
  const imports = importFacts(report, packages, roleOf);
  return {
    modules: report.files.map(({ path: file }) => ({ file, role: roleOf(file), entry: true })),
    packages: packages.directories.map((root) => ({ root, published: packages.isPublished(root) })),
    definitions: definitionFacts(report, productionUses(imports)),
    imports,
    ...goDesignFacts(report, packages),
    docComments: report.docComments ?? [],
    console: testRun === undefined ? [] : goConsoleFacts(testRun, { report, module }),
    constrained: report.files
      .filter(({ constrained }) => constrained)
      .map(({ path: file }) => file),
  };
}
