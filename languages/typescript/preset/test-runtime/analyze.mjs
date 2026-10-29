import { depthFirst } from '../../../../shared/traversal.mjs';
import { syntaxChildren } from '../syntax/children.mjs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ts } from '../../typescript-api/typescript-api.mjs';
import {
  classifyTestRuntime,
  testRuntimeReport,
} from '../../../../shared/rules/test-runtime/classify.mjs';
import {
  isExcludedPath,
  isTypeOnlyDependency,
  normalizePath,
} from '../dependency-graph/cruise.mjs';
import { defaultResolvedLayout } from '../layout.mjs';

const TEST_FILE = /(?:^|\/).+\.(?:test|spec)\.[cm]?[jt]sx?$/;

function isTest(source) {
  return TEST_FILE.test(source);
}

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

function referencedBridges(runtimeModules, sourceText, bridges) {
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
    .filter(isTest)
    .sort();
  function isProductionModule(source) {
    return isProduction(source, context.productionRoots, layout);
  }
  return testRuntimeReport({
    tests: allTests.filter((source) => !isPathExcludedTest(source, layout)),
    excluded: allTests.filter((source) => isPathExcludedTest(source, layout)),
    classify: (source) =>
      classifyTestRuntime(source, {
        edges: context.dependencies,
        isProduction: isProductionModule,
        bridgesOf: (test, visited) =>
          referencedBridges(visited, context.sourceTexts.get(test) ?? '', context.bridges),
      }),
  });
}
