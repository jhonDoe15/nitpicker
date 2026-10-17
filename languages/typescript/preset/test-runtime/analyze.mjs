import { depthFirst } from '../../../../shared/traversal.mjs';
import { syntaxChildren } from '../syntax/children.mjs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';
import { RULE_IDS } from '../../../../shared/policy.mjs';
import {
  isExcludedPath,
  isTypeOnlyDependency,
  normalizePath,
} from '../dependency-graph/cruise.mjs';
import { defaultResolvedLayout } from '../layout.mjs';

function sourceEvidence(source, sourceText) {
  const sourceFile = ts.createSourceFile(source, sourceText, ts.ScriptTarget.Latest, true);
  const dynamicImports = new Set();

  for (const node of depthFirst(sourceFile, syntaxChildren)) {
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length === 1 &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      dynamicImports.add(node.arguments[0].text);
    }
  }
  return { dynamicImports };
}

function isPathExcludedTest(source, layout) {
  return (
    isExcludedPath(source) ||
    layout.isExcluded(source) ||
    layout.isEndToEndTest(source) ||
    new RegExp(`(?:^|/)(?:${layout.testRoots.join('|')})/contract(?:/|$)`).test(source)
  );
}

function isProduction(source, productionRoots, layout) {
  return productionRoots.some((root) => layout.isSourceUnderRoot(source, root));
}

function isDynamicDependency(dependency) {
  return (
    dependency.dynamic === true ||
    dependency.dependencyTypes?.some((kind) => kind.includes('dynamic')) === true
  );
}

function dependencyMap(graph, sourceTexts) {
  const moduleSet = new Set(graph.modules.map((module) => normalizePath(module.source)));
  return new Map(
    graph.modules.map((module) => {
      const source = normalizePath(module.source);
      const evidence = sourceEvidence(source, sourceTexts.get(source) ?? '');
      return [
        source,
        (module.dependencies ?? [])
          .filter((dependency) => typeof dependency.resolved === 'string')
          .map((dependency) => {
            const dynamic =
              isDynamicDependency(dependency) || evidence.dynamicImports.has(dependency.module);
            return {
              target: normalizePath(dependency.resolved),
              kind: !dynamic && isTypeOnlyDependency(dependency) ? 'type-only' : 'runtime',
              dynamic,
            };
          })
          .filter(
            (dependency) => moduleSet.has(dependency.target) && !isExcludedPath(dependency.target),
          ),
      ];
    }),
  );
}

function unvisitedRuntimeTargets(edges, visited) {
  return edges
    .filter((edge) => edge.kind === 'runtime' && !visited.has(edge.target))
    .map((edge) => edge.target);
}

function runtimeReachability(source, dependencies) {
  const direct = dependencies.get(source)?.filter((edge) => edge.kind === 'runtime') ?? [];
  const visited = new Set();
  const pending = direct.map((edge) => edge.target);
  for (const current of pending) {
    if (visited.has(current)) {
      continue;
    }
    visited.add(current);
    pending.push(...unvisitedRuntimeTargets(dependencies.get(current) ?? [], visited));
  }
  return { direct, visited };
}

function typeOnlyProductionReachability({ source, dependencies, productionRoots, layout }) {
  const visited = new Set();
  const production = new Set();
  const pending = (dependencies.get(source) ?? []).map((edge) => ({
    target: edge.target,
    usedTypeOnlyEdge: edge.kind === 'type-only',
  }));

  for (const current of pending) {
    const key = `${current.target}\0${String(current.usedTypeOnlyEdge)}`;
    if (visited.has(key)) {
      continue;
    }
    visited.add(key);
    if (current.usedTypeOnlyEdge && isProduction(current.target, productionRoots, layout)) {
      production.add(current.target);
    }
    for (const edge of dependencies.get(current.target) ?? []) {
      pending.push({
        target: edge.target,
        usedTypeOnlyEdge: current.usedTypeOnlyEdge || edge.kind === 'type-only',
      });
    }
  }
  return [...production].sort();
}

function referencedBridges(runtimeModules, sourceText, bridges) {
  return bridges.filter((bridge) => {
    if (runtimeModules.has(bridge)) {
      return true;
    }
    const basename = path.posix.basename(bridge);
    return sourceText.includes(basename);
  });
}

export async function loadModuleSources(graph, rootDirectory, layout = defaultResolvedLayout) {
  if (!Array.isArray(graph?.modules)) {
    throw new TypeError('Expected a dependency-cruiser graph with a modules array');
  }
  const entries = await Promise.all(
    graph.modules
      .map((module) => normalizePath(module.source))
      .filter((source) => layout.isRunnerTestFile(source) && !isExcludedPath(source))
      .map(async (source) => [source, await readFile(path.join(rootDirectory, source), 'utf8')]),
  );
  return new Map(entries);
}

function defaultBridges(layout) {
  return layout.testRoots.flatMap((root) =>
    layout.entryExtensions.map((extension) => `${root}/fixtures/app-process.${extension}`),
  );
}

export function analyzeTestRuntime(
  graph,
  {
    layout = defaultResolvedLayout,
    productionRoot = layout.sourceRoot,
    productionRoots = [productionRoot],
    sourceTexts = new Map(),
    subprocessBridges = defaultBridges(layout),
  } = {},
) {
  if (!Array.isArray(graph?.modules)) {
    throw new TypeError('Expected a dependency-cruiser graph with a modules array');
  }

  const context = {
    layout,
    dependencies: dependencyMap(graph, sourceTexts),
    sourceTexts,
    bridges: subprocessBridges.map(normalizePath),
    productionRoots: productionRoots.map((root) => normalizePath(root).replace(/\/$/, '')),
  };
  const allTests = graph.modules
    .map((module) => normalizePath(module.source))
    .filter((source) => layout.isRunnerTestFile(source))
    .sort();
  const excluded = allTests.filter((source) => isPathExcludedTest(source, layout)).sort();
  const results = allTests
    .filter((source) => !isPathExcludedTest(source, layout))
    .map((source) => classifyTest(source, context));
  const findings = results.filter((result) =>
    [RULE_IDS.noProductionRuntime, RULE_IDS.typeOnlyProductionDependency].includes(result.category),
  );

  return {
    summary: {
      discoveredTests: allTests.length,
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

function countCategories(results) {
  return Object.fromEntries(
    [...new Set(results.map((result) => result.category))]
      .sort()
      .map((category) => [
        category,
        results.filter((result) => result.category === category).length,
      ]),
  );
}

function classifyTest(source, { layout, dependencies, sourceTexts, bridges, productionRoots }) {
  const { direct, visited } = runtimeReachability(source, dependencies);
  const directProductionEdges = direct.filter((edge) =>
    isProduction(edge.target, productionRoots, layout),
  );
  const runtimeProductionModules = [...visited]
    .filter((target) => isProduction(target, productionRoots, layout))
    .sort();
  const bridgeModules = referencedBridges(visited, sourceTexts.get(source) ?? '', bridges);
  const typeOnlyProductionModules = typeOnlyProductionReachability({
    source,
    dependencies,
    productionRoots,
    layout,
  });
  return {
    test: source,
    category: categoryOf({
      directProductionEdges,
      runtimeProductionModules,
      bridgeModules,
      typeOnlyProductionModules,
    }),
    directProductionModules: directProductionEdges.map((edge) => edge.target).sort(),
    runtimeProductionModules,
    typeOnlyProductionModules,
    subprocessBridges: bridgeModules,
  };
}

function categoryOf({
  directProductionEdges,
  runtimeProductionModules,
  bridgeModules,
  typeOnlyProductionModules,
}) {
  if (directProductionEdges.length > 0) {
    return directProductionEdges.every((edge) => edge.dynamic)
      ? 'dynamic-production-runtime'
      : 'direct-production-runtime';
  }
  if (runtimeProductionModules.length > 0) {
    return 'transitive-production-runtime';
  }
  if (bridgeModules.length > 0) {
    return 'subprocess-production-runtime';
  }
  return typeOnlyProductionModules.length > 0
    ? RULE_IDS.typeOnlyProductionDependency
    : RULE_IDS.noProductionRuntime;
}
