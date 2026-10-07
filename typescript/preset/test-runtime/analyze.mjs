import { readFile } from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';
import {
  isExcludedPath,
  isTypeOnlyDependency,
  normalizePath,
} from '../dependency-graph/cruise.mjs';

const TEST_FILE = /(?:^|\/).+\.(?:test|spec)\.[cm]?ts$/;

function isTest(source) {
  return TEST_FILE.test(source);
}

function sourceEvidence(sourceText) {
  const sourceFile = ts.createSourceFile(
    'test.ts',
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const dynamicImports = new Set();

  function visit(node) {
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length === 1 &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      dynamicImports.add(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return { dynamicImports };
}

function isPathExcludedTest(source) {
  return isExcludedPath(source) || /(?:^|\/)tests\/contract(?:\/|$)/.test(source);
}

function isWithin(source, root) {
  return source === root || source.startsWith(`${root}/`);
}

function isProduction(source, productionRoot) {
  return (
    isWithin(source, productionRoot) &&
    !isExcludedPath(source) &&
    !source.includes('/__tests__/') &&
    !/\.(?:test|spec)\.[cm]?ts$/.test(source)
  );
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
      const evidence = sourceEvidence(sourceTexts.get(source) ?? '');
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

function runtimeReachability(source, dependencies) {
  const direct = dependencies.get(source)?.filter((edge) => edge.kind === 'runtime') ?? [];
  const visited = new Set();
  const pending = direct.map((edge) => edge.target);
  while (pending.length > 0) {
    const current = pending.shift();
    if (visited.has(current)) {
      continue;
    }
    visited.add(current);
    for (const edge of dependencies.get(current) ?? []) {
      if (edge.kind === 'runtime' && !visited.has(edge.target)) {
        pending.push(edge.target);
      }
    }
  }
  return { direct, visited };
}

function typeOnlyProductionReachability(source, dependencies, productionRoot) {
  const visited = new Set();
  const production = new Set();
  const pending = (dependencies.get(source) ?? []).map((edge) => ({
    target: edge.target,
    usedTypeOnlyEdge: edge.kind === 'type-only',
  }));

  while (pending.length > 0) {
    const current = pending.shift();
    const key = `${current.target}\0${String(current.usedTypeOnlyEdge)}`;
    if (visited.has(key)) {
      continue;
    }
    visited.add(key);
    if (current.usedTypeOnlyEdge && isProduction(current.target, productionRoot)) {
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

function referencedBridges(source, runtimeModules, sourceText, bridges) {
  return bridges.filter((bridge) => {
    if (runtimeModules.has(bridge)) {
      return true;
    }
    const basename = path.posix.basename(bridge);
    return sourceText.includes(basename);
  });
}

export async function loadModuleSources(graph, rootDirectory) {
  if (!Array.isArray(graph?.modules)) {
    throw new TypeError('Expected a dependency-cruiser graph with a modules array');
  }
  const entries = await Promise.all(
    graph.modules
      .map((module) => normalizePath(module.source))
      .filter((source) => isTest(source) && !isExcludedPath(source))
      .map(async (source) => [source, await readFile(path.join(rootDirectory, source), 'utf8')]),
  );
  return new Map(entries);
}

export function analyzeTestRuntime(
  graph,
  {
    productionRoot = 'src/main',
    sourceTexts = new Map(),
    subprocessBridges = ['tests/fixtures/app-process.ts'],
  } = {},
) {
  if (!Array.isArray(graph?.modules)) {
    throw new TypeError('Expected a dependency-cruiser graph with a modules array');
  }

  const normalizedProductionRoot = normalizePath(productionRoot).replace(/\/$/, '');
  const bridges = subprocessBridges.map(normalizePath);
  const dependencies = dependencyMap(graph, sourceTexts);
  const allTests = graph.modules
    .map((module) => normalizePath(module.source))
    .filter(isTest)
    .sort();
  const pathExcluded = allTests.filter(isPathExcludedTest);
  const tests = allTests.filter((source) => !isPathExcludedTest(source));

  const results = tests.map((source) => {
    const { direct, visited } = runtimeReachability(source, dependencies);
    const directProductionEdges = direct.filter((edge) =>
      isProduction(edge.target, normalizedProductionRoot),
    );
    const runtimeProductionModules = [...visited]
      .filter((target) => isProduction(target, normalizedProductionRoot))
      .sort();
    const bridgeModules = referencedBridges(
      source,
      visited,
      sourceTexts.get(source) ?? '',
      bridges,
    );
    const typeOnlyProductionModules = typeOnlyProductionReachability(
      source,
      dependencies,
      normalizedProductionRoot,
    );

    let category;
    if (directProductionEdges.length > 0) {
      category = directProductionEdges.every((edge) => edge.dynamic)
        ? 'dynamic-production-runtime'
        : 'direct-production-runtime';
    } else if (runtimeProductionModules.length > 0) {
      category = 'transitive-production-runtime';
    } else if (bridgeModules.length > 0) {
      category = 'subprocess-production-runtime';
    } else if (typeOnlyProductionModules.length > 0) {
      category = 'type-only-production-dependency';
    } else {
      category = 'no-production-runtime';
    }

    return {
      test: source,
      category,
      directProductionModules: directProductionEdges.map((edge) => edge.target).sort(),
      runtimeProductionModules,
      typeOnlyProductionModules,
      subprocessBridges: bridgeModules,
    };
  });
  const excluded = [...pathExcluded].sort();

  const categoryCounts = Object.fromEntries(
    [...new Set(results.map((result) => result.category))]
      .sort()
      .map((category) => [
        category,
        results.filter((result) => result.category === category).length,
      ]),
  );
  const findings = results.filter((result) =>
    ['no-production-runtime', 'type-only-production-dependency'].includes(result.category),
  );

  return {
    summary: {
      discoveredTests: allTests.length,
      analyzedTests: results.length,
      excludedTests: excluded.length,
      findings: findings.length,
      categories: categoryCounts,
    },
    exclusions: excluded,
    tests: results,
    findings,
  };
}
