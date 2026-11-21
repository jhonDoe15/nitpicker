import { groupBy, reexportSteps } from '../facts/fact-graph.mts';
import { packageLookup, roleLookup } from '../facts/reuse-modules.mts';
import { NEUTRAL_TEST_ONLY_MESSAGES, testOnlyFindings } from './test-only-judgement.mts';
import type { Finding } from '../../values/findings.mts';
import { appendAll } from '../../lists/lists.mts';
import type { ReexportStep } from '../facts/fact-graph.mts';
import type {
  FactDefinition,
  FactImport,
  FactModule,
  Facts,
  RuleContext,
} from '../facts/typed/fact-types.mts';
import type { TestOnlyItem } from './test-only-judgement.mts';

type Roles = Map<string, Set<string>>;
type UseGraph = {
  readonly exports: Map<string, Map<string, string>>;
  readonly reexports: Map<string, FactImport[]>;
  readonly loaded: Roles;
  readonly starred: Roles;
  readonly named: Roles;
};

const TYPE_KINDS = new Set(['type', 'interface']);

function addRole(map: Roles, key: string, role: string): void {
  const roles = map.get(key) ?? new Set<string>();
  roles.add(role);
  map.set(key, roles);
}

function moduleExports(definitions: readonly FactDefinition[]): Map<string, Map<string, string>> {
  const byFile = new Map<string, Map<string, string>>();
  for (const { file, name, exported, exportNames = exported ? [name] : [] } of definitions) {
    const names = byFile.get(file) ?? new Map<string, string>();
    for (const exportName of exportNames) {
      names.set(exportName, name);
    }
    byFile.set(file, names);
  }
  return byFile;
}

function recordStep(graph: UseGraph, step: ReexportStep, role: string): ReexportStep[] {
  addRole(graph.loaded, step.file, role);
  const local = graph.exports.get(step.file)?.get(step.name);
  if (step.name === '*') {
    addRole(graph.starred, step.file, role);
  }
  if (local !== undefined) {
    addRole(graph.named, `${step.file}\0${local}`, role);
    return [];
  }
  return reexportSteps(graph.reexports.get(step.file) ?? [], step.name);
}

function recordUses(graph: UseGraph, start: ReexportStep, role: string): void {
  const seen = new Set<string>();
  const pending = [start];
  for (const step of pending) {
    const visit = `${step.file}\0${step.name}`;
    if (!seen.has(visit)) {
      seen.add(visit);
      appendAll(pending, recordStep(graph, step, role));
    }
  }
}

function usesOf({
  definitions,
  imports,
}: {
  readonly definitions: readonly FactDefinition[];
  readonly imports: readonly FactImport[];
}): UseGraph {
  const graph: UseGraph = {
    exports: moduleExports(definitions),
    reexports: groupBy(
      imports.filter(({ reexport }) => reexport),
      ({ from }) => from,
    ),
    loaded: new Map<string, Set<string>>(),
    starred: new Map<string, Set<string>>(),
    named: new Map<string, Set<string>>(),
  };
  for (const record of imports.filter(({ reexport }) => !reexport)) {
    const role = record.role ?? 'production';
    addRole(graph.loaded, record.to, role);
    for (const { name } of record.names) {
      recordUses(graph, { file: record.to, name }, role);
    }
  }
  return graph;
}

function isTestOnly(roles: ReadonlySet<string> | undefined): boolean {
  return roles !== undefined && roles.has('test') && !roles.has('production');
}

function definitionCandidates(
  file: string,
  definitions: readonly FactDefinition[],
  graph: UseGraph,
): TestOnlyItem[] {
  const starred = graph.starred.get(file) ?? new Set<string>();
  return definitions
    .filter(
      ({ exported, exportNames, entry }) =>
        entry !== true && (exported || (exportNames ?? []).length > 0),
    )
    .filter(({ name }) =>
      isTestOnly(new Set([...(graph.named.get(`${file}\0${name}`) ?? []), ...starred])),
    )
    .map(({ name, kind, line, exportNames }) => ({
      file,
      category: TYPE_KINDS.has(kind) ? 'types' : 'exports',
      entry: { name: exportNames?.[0] ?? name, line },
    }));
}

function testOnlyCandidates({
  modules,
  definitions,
  imports,
}: {
  readonly modules: readonly FactModule[];
  readonly definitions: readonly FactDefinition[];
  readonly imports: readonly FactImport[];
}): TestOnlyItem[] {
  const graph = usesOf({ definitions, imports });
  const byFile = groupBy(definitions, ({ file }) => file);
  const production = modules.filter(({ role }) => role !== 'test');
  return production.flatMap(({ file, entry }) => {
    if (entry !== true && isTestOnly(graph.loaded.get(file))) {
      return [{ file, category: 'files', entry: { name: file } }];
    }
    return definitionCandidates(file, byFile.get(file) ?? [], graph);
  });
}

export function testOnlyFactFindings(
  facts: Facts,
  { analyzerName, isExcepted }: RuleContext,
): Finding[] {
  const packageOf = packageLookup(facts.packages);
  const roleOf = roleLookup(facts.modules);
  const definitions = (facts.definitions ?? []).filter(({ file }) => roleOf(file) !== 'test');
  return testOnlyFindings(
    testOnlyCandidates({
      modules: facts.modules ?? [],
      definitions,
      imports: facts.imports ?? [],
    }),
    {
      analyzerName,
      isExcepted,
      isPublished: (file) => packageOf(file)?.published === true,
      messages: NEUTRAL_TEST_ONLY_MESSAGES,
    },
  );
}
