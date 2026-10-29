import { RULE_IDS } from '../../policy.mjs';

const RUNTIME = 'runtime';
const TYPE_ONLY = 'type-only';
const SUBPROCESS = 'subprocess-production-runtime';
const FINDING_CATEGORIES = new Set([
  RULE_IDS.noProductionRuntime,
  RULE_IDS.typeOnlyProductionDependency,
]);

function runtimeEdges(edges, node) {
  return (edges.get(node) ?? []).filter(({ kind }) => kind === RUNTIME);
}

function runtimeReachability(test, edges) {
  const direct = runtimeEdges(edges, test);
  const visited = new Set();
  const pending = direct.map(({ target }) => target);
  for (const current of pending) {
    if (visited.has(current)) {
      continue;
    }
    visited.add(current);
    pending.push(
      ...runtimeEdges(edges, current)
        .map(({ target }) => target)
        .filter((target) => !visited.has(target)),
    );
  }
  return { direct, visited };
}

function typeOnlyProductionReachability(test, { edges, isProduction }) {
  const visited = new Set();
  const production = new Set();
  const pending = (edges.get(test) ?? []).map((edge) => ({
    target: edge.target,
    usedTypeOnlyEdge: edge.kind === TYPE_ONLY,
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
        target: edge.target,
        usedTypeOnlyEdge: current.usedTypeOnlyEdge || edge.kind === TYPE_ONLY,
      });
    }
  }
  return [...production].sort();
}

function categoryOf(evidence, bridgeCategory) {
  const { directProductionEdges, runtimeProductionModules, bridges, typeOnlyProductionModules } =
    evidence;
  if (directProductionEdges.length > 0) {
    return directProductionEdges.every((edge) => edge.dynamic === true)
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

export function classifyTestRuntime(
  test,
  { edges, isProduction, bridgesOf = () => [], bridgeCategory = SUBPROCESS },
) {
  const { direct, visited } = runtimeReachability(test, edges);
  const directProductionEdges = direct.filter(({ target }) => isProduction(target));
  const evidence = {
    directProductionEdges,
    runtimeProductionModules: [...visited].filter(isProduction).sort(),
    bridges: bridgesOf(test, visited),
    typeOnlyProductionModules: typeOnlyProductionReachability(test, { edges, isProduction }),
  };
  return {
    test,
    category: categoryOf(evidence, bridgeCategory),
    directProductionModules: directProductionEdges.map(({ target }) => target).sort(),
    runtimeProductionModules: evidence.runtimeProductionModules,
    typeOnlyProductionModules: evidence.typeOnlyProductionModules,
    subprocessBridges: evidence.bridges,
  };
}

function countCategories(results) {
  const counts = new Map();
  for (const { category } of results) {
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }
  return Object.fromEntries(
    [...counts.keys()].sort().map((category) => [category, counts.get(category)]),
  );
}

export function testRuntimeReport({ tests, excluded = [], classify }) {
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
    exclusions: excluded,
    tests: results,
    findings,
  };
}
