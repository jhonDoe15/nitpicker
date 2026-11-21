import { appendAll } from '../../lists/lists.mts';
import { RULE_IDS } from '../../policy.mts';
import { fieldOf, textOf } from '../../values/readers.mts';

type Edges = ReadonlyMap<string, readonly object[]>;
type Scope = {
  readonly edges: Edges;
  readonly isProduction: (node: string) => boolean;
};
type Evidence<Bridge> = {
  readonly directProductionEdges: readonly object[];
  readonly runtimeProductionModules: string[];
  readonly bridges: Bridge[];
  readonly typeOnlyProductionModules: string[];
};
type Visit = { readonly target: string; readonly usedTypeOnlyEdge: boolean };
export type TestRuntimeResult<Bridge = string> = {
  readonly test: string;
  readonly category: string;
  readonly directProductionModules: string[];
  readonly runtimeProductionModules: string[];
  readonly typeOnlyProductionModules: string[];
  readonly subprocessBridges: Bridge[];
};

function targetOf(edge: object): string {
  return textOf(fieldOf(edge, 'target'));
}

function kindOf(edge: object): unknown {
  return fieldOf(edge, 'kind');
}

export const EDGE_KINDS = Object.freeze({ RUNTIME: 'runtime', TYPE_ONLY: 'type-only' });
export const FRAMEWORK_BRIDGE = 'framework-production-runtime';
const { RUNTIME, TYPE_ONLY } = EDGE_KINDS;
const SUBPROCESS = 'subprocess-production-runtime';
const FINDING_CATEGORIES = new Set([
  RULE_IDS.noProductionRuntime,
  RULE_IDS.typeOnlyProductionDependency,
]);

function runtimeEdges(edges: Edges, node: string): readonly object[] {
  return (edges.get(node) ?? []).filter((edge) => kindOf(edge) === RUNTIME);
}

function runtimeReachability(
  test: string,
  edges: Edges,
): { direct: readonly object[]; visited: Set<string> } {
  const direct = runtimeEdges(edges, test);
  const visited = new Set<string>();
  const pending = direct.map(targetOf);
  for (const current of pending) {
    if (visited.has(current)) {
      continue;
    }
    visited.add(current);
    appendAll(
      pending,
      runtimeEdges(edges, current)
        .map(targetOf)
        .filter((target) => !visited.has(target)),
    );
  }
  return { direct, visited };
}

function typeOnlyProductionReachability(test: string, { edges, isProduction }: Scope): string[] {
  const visited = new Set<string>();
  const production = new Set<string>();
  const pending: Visit[] = (edges.get(test) ?? []).map((edge) => ({
    target: targetOf(edge),
    usedTypeOnlyEdge: kindOf(edge) === TYPE_ONLY,
  }));
  for (const current of pending) {
    const key = `${current.target}\0${String(current.usedTypeOnlyEdge)}`;
    if (visited.has(key)) {
      continue;
    }
    visited.add(key);
    if (current.usedTypeOnlyEdge && isProduction(current.target)) {
      production.add(current.target);
    }
    for (const edge of edges.get(current.target) ?? []) {
      pending.push({
        target: targetOf(edge),
        usedTypeOnlyEdge: current.usedTypeOnlyEdge || kindOf(edge) === TYPE_ONLY,
      });
    }
  }
  return [...production].sort();
}

function categoryOf<Bridge>(evidence: Evidence<Bridge>, bridgeCategory: string): string {
  const { directProductionEdges, runtimeProductionModules, bridges, typeOnlyProductionModules } =
    evidence;
  if (directProductionEdges.length > 0) {
    return directProductionEdges.every((edge) => fieldOf(edge, 'dynamic') === true)
      ? 'dynamic-production-runtime'
      : 'direct-production-runtime';
  }
  if (runtimeProductionModules.length > 0) {
    return 'transitive-production-runtime';
  }
  if (bridges.length > 0) {
    return bridgeCategory;
  }
  return typeOnlyProductionModules.length > 0
    ? RULE_IDS.typeOnlyProductionDependency
    : RULE_IDS.noProductionRuntime;
}

export function classifyTestRuntime<Bridge = string>(
  test: string,
  {
    edges,
    isProduction,
    bridgesOf = () => [],
    bridgeCategory = SUBPROCESS,
  }: Scope & {
    readonly bridgesOf?: ((test: string, visited: Set<string>) => Bridge[]) | undefined;
    readonly bridgeCategory?: string | undefined;
  },
): TestRuntimeResult<Bridge> {
  const { direct, visited } = runtimeReachability(test, edges);
  const directProductionEdges = direct.filter((edge) => isProduction(targetOf(edge)));
  const evidence: Evidence<Bridge> = {
    directProductionEdges,
    runtimeProductionModules: [...visited].filter(isProduction).sort(),
    bridges: bridgesOf(test, visited),
    typeOnlyProductionModules: typeOnlyProductionReachability(test, { edges, isProduction }),
  };
  return {
    test,
    category: categoryOf(evidence, bridgeCategory),
    directProductionModules: directProductionEdges.map(targetOf).sort(),
    runtimeProductionModules: evidence.runtimeProductionModules,
    typeOnlyProductionModules: evidence.typeOnlyProductionModules,
    subprocessBridges: evidence.bridges,
  };
}

function countCategories(
  results: readonly { readonly category: string }[],
): Record<string, number> {
  const counts = new Map<string, number>();
  for (const { category } of results) {
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }
  return Object.fromEntries(
    [...counts.keys()].sort().map((category) => [category, counts.get(category) ?? 0]),
  );
}

type TestRuntimeReportShape<Result> = {
  readonly summary: {
    readonly discoveredTests: number;
    readonly analyzedTests: number;
    readonly excludedTests: number;
    readonly findings: number;
    readonly categories: Record<string, number>;
  };
  readonly exclusions: string[];
  readonly tests: Result[];
  readonly findings: Result[];
};

export function testRuntimeReport<Result extends { readonly category: string }>({
  tests,
  excluded = [],
  classify,
}: {
  readonly tests: readonly string[];
  readonly excluded?: readonly string[] | undefined;
  readonly classify: (test: string) => Result;
}): TestRuntimeReportShape<Result> {
  const results = tests.map(classify);
  const findings = results.filter(({ category }) => FINDING_CATEGORIES.has(category));
  return {
    summary: {
      discoveredTests: tests.length + excluded.length,
      analyzedTests: results.length,
      excludedTests: excluded.length,
      findings: findings.length,
      categories: countCategories(results),
    },
    exclusions: [...excluded],
    tests: results,
    findings,
  };
}
