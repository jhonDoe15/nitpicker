import path from 'node:path';
import { internalEdges, isGraph, normalizePath } from '../dependency-graph/cruise.mts';
import type { DependencyGraph, GraphEdge, GraphModule } from '../dependency-graph/graph-types.mts';
import { defaultResolvedLayout } from '../layout.mts';
import { appendAll } from '../../../../shared/lists/items.mjs';
import { isInsideRoot, isProjectRoot, underRoot } from '../layout/source-root/root-paths.mts';
import type {
  AnalysisLayout,
  BoundaryFinding,
  BoundaryGroups,
  EntryPointAnalysis,
  EntryPointScope,
  ScopeOptions,
} from './analysis-types.mts';

const DEFAULT_FOUNDATION_DIRECTORIES = new Set(['shared', 'utils']);
const COMPOSITION_ROOT_NAMES = ['composition-root', 'main', 'server'];
const CONCRETE_NAME = '(?:client|pool|cache|store|scheduler|transport|adapter|service)';

const ROOT_COMPONENT = '(root)';

function defaultCompositionRoots(layout: AnalysisLayout): Set<string> {
  return new Set(
    COMPOSITION_ROOT_NAMES.flatMap((name) =>
      layout.entryExtensions.map((extension) => `${name}.${extension}`),
    ),
  );
}

function concreteFilePattern(layout: AnalysisLayout): RegExp {
  return new RegExp(`${CONCRETE_NAME}\\.[cm]?${layout.javascript ? '[jt]s' : 'ts'}$`, 'i');
}

function declaredEntryPoints({
  components,
  productionModules,
  root,
  layout,
}: {
  readonly components: ReadonlySet<string>;
  readonly productionModules: readonly string[];
  readonly root: string;
  readonly layout: AnalysisLayout;
}): Map<string, string> {
  const candidates = [...components].flatMap((component) => {
    const entryPoint = layout.entryExtensions
      .map((extension) => underRoot(root, `${component}/index.${extension}`))
      .find((candidate) => productionModules.includes(candidate));
    return entryPoint === undefined ? [] : [[component, entryPoint] as const];
  });
  return new Map(candidates);
}

function pathUnderRoot(modulePath: string, sourceRoot: string): string {
  return isProjectRoot(sourceRoot)
    ? modulePath
    : modulePath.slice(sourceRoot.length).replace(/^\//, '');
}

function componentName(modulePath: string, sourceRoot: string): string {
  const relativePath = pathUnderRoot(modulePath, sourceRoot);
  return relativePath.includes('/')
    ? (relativePath.split('/')[0] ?? ROOT_COMPONENT)
    : ROOT_COMPONENT;
}

function isProductionModule(
  modulePath: string,
  sourceRoot: string,
  layout: AnalysisLayout,
): boolean {
  return layout.isSourceUnderRoot(modulePath, sourceRoot);
}

function exportedTargetsOf(module: GraphModule, sourceRoot: string): string[] {
  return (module.dependencies ?? [])
    .flatMap((dependency) =>
      typeof dependency.resolved === 'string' &&
      dependency.dependencyTypes?.includes('export') === true
        ? [normalizePath(dependency.resolved)]
        : [],
    )
    .filter((target) => isInsideRoot(target, sourceRoot));
}

function exportTargetsBySource(
  graph: DependencyGraph,
  sourceRoot: string,
): Map<string, Set<string>> {
  const exportTargets = new Map<string, Set<string>>();
  for (const module of graph.modules) {
    const source = normalizePath(module.source);
    if (!isInsideRoot(source, sourceRoot)) {
      continue;
    }
    for (const target of exportedTargetsOf(module, sourceRoot)) {
      const targets = exportTargets.get(source) ?? new Set<string>();
      targets.add(target);
      exportTargets.set(source, targets);
    }
  }
  return exportTargets;
}

function exportReachability(
  graph: DependencyGraph,
  sourceRoot: string,
): (entryPoint: string, target: string) => boolean {
  const exportTargets = exportTargetsBySource(graph, sourceRoot);

  return (entryPoint, target) => {
    const pending = [entryPoint];
    const visited = new Set<string>();
    for (const current of pending) {
      if (current === target) {
        return true;
      }
      if (visited.has(current)) {
        continue;
      }
      visited.add(current);
      appendAll(pending, exportTargets.get(current) ?? []);
    }
    return false;
  };
}

function byLocation(
  left: { readonly source: string; readonly target: string },
  right: { readonly source: string; readonly target: string },
): number {
  return left.source.localeCompare(right.source) || left.target.localeCompare(right.target);
}

function normalizedSourceRoot(
  sources: readonly string[],
  requestedRoot: string,
  layout: AnalysisLayout,
): string {
  const legacyRoot = underRoot(requestedRoot, 'main');
  const legacyOnly =
    layout.sourceRoots.includes(requestedRoot) &&
    sources.some((source) => layout.isSourceUnderRoot(source, legacyRoot)) &&
    !sources.some(
      (source) =>
        layout.isSourceUnderRoot(source, requestedRoot) && !isInsideRoot(source, legacyRoot),
    );
  return legacyOnly ? legacyRoot : requestedRoot;
}

function entryPointScope(
  graph: unknown,
  sourceRoot: string,
  options: ScopeOptions,
): EntryPointScope {
  if (!isGraph(graph)) {
    throw new TypeError('Expected a dependency-cruiser graph with a modules array');
  }
  const { layout, foundationDirectories } = options;
  const sources = graph.modules.map((module) => normalizePath(module.source));
  const root = normalizedSourceRoot(sources, normalizePath(sourceRoot).replace(/\/$/, ''), layout);
  const productionModules = sources.filter(
    (source) => isInsideRoot(source, root) && isProductionModule(source, root, layout),
  );
  const components = new Set(
    productionModules
      .map((source) => componentName(source, root))
      .filter((name) => name !== ROOT_COMPONENT && !foundationDirectories.has(name)),
  );
  return {
    ...options,
    graph,
    root,
    productionModules,
    components,
    entryPoints: declaredEntryPoints({ components, productionModules, root, layout }),
    isExportReachable: exportReachability(graph, root),
  };
}

function crossBoundaryFinding(
  edge: GraphEdge,
  scope: EntryPointScope,
): BoundaryFinding | undefined {
  if (!(
    isProductionModule(edge.source, scope.root, scope.layout) &&
    isProductionModule(edge.target, scope.root, scope.layout)
  )) {
    return undefined;
  }
  const sourceComponent = componentName(edge.source, scope.root);
  const targetComponent = componentName(edge.target, scope.root);
  if (
    scope.compositionRoots.has(pathUnderRoot(edge.source, scope.root)) ||
    sourceComponent === targetComponent ||
    !scope.components.has(targetComponent)
  ) {
    return undefined;
  }
  return {
    source: edge.source,
    target: edge.target,
    sourceComponent,
    targetComponent,
    dependencyKind: edge.kind,
  };
}

function recordBoundaryFinding(
  finding: BoundaryFinding,
  scope: EntryPointScope,
  groups: BoundaryGroups,
): void {
  const entryPoint = scope.entryPoints.get(finding.targetComponent);
  if (entryPoint === undefined) {
    groups.missingEntryPointImports.push(finding);
    return;
  }
  if (finding.target === entryPoint) {
    groups.throughEntryPoint.push(finding);
    return;
  }
  const group = scope.isExportReachable(entryPoint, finding.target)
    ? groups.publicAlternativeBypasses
    : groups.unexportedTargetImports;
  group.push({ ...finding, publicEntryPoint: entryPoint });
}

function boundaryImports(scope: EntryPointScope): BoundaryGroups {
  const groups: BoundaryGroups = {
    throughEntryPoint: [],
    publicAlternativeBypasses: [],
    unexportedTargetImports: [],
    missingEntryPointImports: [],
    concreteCrossBoundaryImports: [],
  };
  for (const edge of internalEdges(scope.graph, scope.root)) {
    const finding = crossBoundaryFinding(edge, scope);
    if (!finding) {
      continue;
    }
    recordBoundaryFinding(finding, scope, groups);
    if (concreteFilePattern(scope.layout).test(path.basename(edge.target))) {
      groups.concreteCrossBoundaryImports.push(finding);
    }
  }
  for (const findings of Object.values(groups)) {
    findings.sort(byLocation);
  }
  return groups;
}

export function analyzeEntryPoints(
  graph: unknown,
  sourceRoot: string,
  {
    layout = defaultResolvedLayout,
    foundationDirectories = DEFAULT_FOUNDATION_DIRECTORIES,
    compositionRoots = defaultCompositionRoots(layout),
  }: {
    readonly layout?: AnalysisLayout;
    readonly foundationDirectories?: ReadonlySet<string>;
    readonly compositionRoots?: ReadonlySet<string>;
  } = {},
): EntryPointAnalysis {
  const scope = entryPointScope(graph, sourceRoot, {
    layout,
    foundationDirectories,
    compositionRoots,
  });
  const groups = boundaryImports(scope);
  return {
    summary: {
      productionModules: scope.productionModules.length,
      components: scope.components.size,
      declaredEntryPoints: scope.entryPoints.size,
      ...Object.fromEntries(
        Object.entries(groups).map(([key, findings]) => [key, findings.length]),
      ),
    },
    components: [...scope.components].sort(),
    ...groups,
  };
}
