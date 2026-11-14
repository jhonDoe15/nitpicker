import type TypeScript from 'typescript';
import { typescriptApi } from '../../adapters/typed/typescript-program.mts';
import type {
  AnalysisLayout,
  AnalyzeOptions,
  Edge,
  Graph,
  GraphDependency,
  GraphModule,
  RuntimeReport,
} from './analysis-types.mts';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  classifier,
  containedPath,
  defaultLayout,
  depthFirst,
  escapeRegExp,
  isExcludedPath,
  isTypeOnlyDependency,
  normalizePath,
  reporter,
  syntaxChildren,
} from './analysis-views.mts';

const TEST_FILE = /(?:^|\/).+\.(?:test|spec)\.[cm]?[jt]sx?$/;

function isTest(source: string): boolean {
  return TEST_FILE.test(source);
}

function dynamicImportSpecifier(node: TypeScript.Node): string | undefined {
  const ts = typescriptApi();
  if (!(
    ts.isCallExpression(node) &&
    node.expression.kind === ts.SyntaxKind.ImportKeyword &&
    node.arguments.length === 1
  )) {
    return undefined;
  }
  const [argument] = node.arguments;
  return argument !== undefined && ts.isStringLiteral(argument) ? argument.text : undefined;
}

function sourceEvidence(source: string, sourceText: string): { dynamicImports: Set<string> } {
  const ts = typescriptApi();
  const sourceFile = ts.createSourceFile(source, sourceText, ts.ScriptTarget.Latest, true);
  const dynamicImports = new Set<string>();

  for (const node of depthFirst<TypeScript.Node>(sourceFile, syntaxChildren)) {
    const specifier = dynamicImportSpecifier(node);
    if (specifier !== undefined) {
      dynamicImports.add(specifier);
    }
  }
  return { dynamicImports };
}

function isPathExcludedTest(source: string, layout: AnalysisLayout): boolean {
  return (
    isExcludedPath(source) ||
    layout.isExcluded(source) ||
    layout.isEndToEndTest(source) ||
    new RegExp(`(?:^|/)(?:${layout.testRoots.map(escapeRegExp).join('|')})/contract(?:/|$)`).test(
      source,
    )
  );
}

function isProduction(
  source: string,
  productionRoots: readonly string[],
  layout: AnalysisLayout,
): boolean {
  return productionRoots.some((root) => layout.isSourceUnderRoot(source, root));
}

function isDynamicDependency(dependency: GraphDependency): boolean {
  return (
    dependency.dynamic === true ||
    dependency.dependencyTypes?.some((kind) => kind.includes('dynamic')) === true
  );
}

function dependencyMap(
  modules: readonly GraphModule[],
  sourceTexts: ReadonlyMap<string, string>,
): Map<string, Edge[]> {
  const moduleSet = new Set(modules.map((module) => normalizePath(module.source)));
  return new Map(
    modules.map((module): [string, Edge[]] => {
      const source = normalizePath(module.source);
      const evidence = sourceEvidence(source, sourceTexts.get(source) ?? '');
      return [
        source,
        (module.dependencies ?? [])
          .filter((dependency) => typeof dependency.resolved === 'string')
          .map((dependency): Edge => {
            const dynamic =
              isDynamicDependency(dependency) ||
              evidence.dynamicImports.has(dependency.module ?? '');
            return {
              target: normalizePath(dependency.resolved ?? ''),
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

function referencedBridges(
  runtimeModules: ReadonlySet<string>,
  sourceText: string,
  bridges: readonly string[],
): string[] {
  return bridges.filter((bridge) => {
    if (runtimeModules.has(bridge)) {
      return true;
    }
    const basename = path.posix.basename(bridge);
    return sourceText.includes(basename);
  });
}

function modulesOf(graph: Graph | undefined): readonly GraphModule[] {
  const modules: unknown = graph?.modules;
  if (!Array.isArray(modules)) {
    throw new TypeError('Expected a dependency-cruiser graph with a modules array');
  }
  return graph?.modules ?? [];
}

export async function loadModuleSources(
  graph: Graph | undefined,
  rootDirectory: string,
): Promise<Map<string, string>> {
  const entries = await Promise.all(
    modulesOf(graph)
      .map((module) => normalizePath(module.source))
      .filter((source) => isTest(source) && !isExcludedPath(source))
      .map(async (source): Promise<[string, string]> => [
        source,
        await readFile(containedPath(rootDirectory, source), 'utf8'),
      ]),
  );
  return new Map(entries);
}

function defaultBridges(layout: AnalysisLayout): string[] {
  return layout.testRoots.flatMap((root) =>
    layout.entryExtensions.map((extension) => `${root}/fixtures/app-process.${extension}`),
  );
}

export function analyzeTestRuntime(
  graph: Graph | undefined,
  {
    layout = defaultLayout,
    productionRoots = [layout.sourceRoot],
    sourceTexts = new Map<string, string>(),
    subprocessBridges = defaultBridges(layout),
  }: AnalyzeOptions = {},
): RuntimeReport {
  const modules = modulesOf(graph);

  const context = {
    layout,
    dependencies: dependencyMap(modules, sourceTexts),
    sourceTexts,
    bridges: subprocessBridges.map(normalizePath),
    productionRoots: productionRoots.map((root) => normalizePath(root).replace(/\/$/, '')),
  };
  const allTests = modules
    .map((module) => normalizePath(module.source))
    .filter(isTest)
    .sort();
  function isProductionModule(source: string): boolean {
    return isProduction(source, context.productionRoots, layout);
  }
  return reporter.report({
    tests: allTests.filter((source) => !isPathExcludedTest(source, layout)),
    excluded: allTests.filter((source) => isPathExcludedTest(source, layout)),
    classify: (source) =>
      classifier.classify(source, {
        edges: context.dependencies,
        isProduction: isProductionModule,
        bridgesOf: (test, visited) =>
          referencedBridges(visited, context.sourceTexts.get(test) ?? '', context.bridges),
      }),
  });
}
