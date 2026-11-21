import path from 'node:path';
import { internalEdges, isGraph, normalizePath } from '../dependency-graph/cruise.mts';
import type {
  DependencyGraph,
  GraphDependency,
  GraphEdge,
} from '../dependency-graph/graph-types.mts';
import { defaultResolvedLayout } from '../layout.mts';
import { isInsideRoot, isProjectRoot, relativeToRoot } from '../layout/source-root/root-paths.mts';
import { isReuseProductionPath, projectPathOf } from '../structure/reuse/reuse-paths.mts';
import { sharedUsedByOneFeature } from './shared-usage.mts';
import { featureLayout } from '../architecture/strict-layout.mts';
import { stabilityUnits } from './feature-layout.mts';
import { globMatcher } from '../../../../shared/paths/glob.mts';
import { computeCoupling } from '../../../../shared/rules/coupling.mts';
import {
  featureRoles,
  PUBLIC_FACES,
  withPublicFace,
} from '../../../../shared/rules/features/feature-roles.mts';
import type { SharedEntry } from '../../../../shared/rules/features/shared-usage.mts';
import type { RoleOf } from '../../../../shared/rules/features/typed/role-types.mts';
import type { CouplingLayout, ModuleMetric, PackageMetric } from './typed/coupling-types.mts';

type CouplingMetrics = ReturnType<typeof computeCoupling>;

export type CouplingOptions = {
  readonly layout?: CouplingLayout;
  readonly projectRoot?: string;
  readonly roleOf?: RoleOf;
};

type ModuleEntry = { readonly source: string } & Omit<ModuleMetric, 'module'>;

export type CouplingReport = {
  readonly summary: {
    readonly modules: number;
    readonly dependencies: number;
    readonly runtimeDependencies: number;
    readonly typeOnlyDependencies: number;
    readonly packages: number;
  };
  readonly hubs: ModuleEntry[];
  readonly modules: ModuleEntry[];
  readonly moduleImports: readonly {
    readonly from: string;
    readonly to: string;
    readonly typeOnly: boolean;
  }[];
  readonly packages: readonly PackageMetric[];
  readonly stabilityDirection: CouplingMetrics['stabilityDirection'];
  readonly sharedUsedByOneFeature: SharedEntry[];
};

function pathWithinRoot(file: string, sourceRoot: string): string {
  return isInsideRoot(file, sourceRoot) ? relativeToRoot(file, sourceRoot) : file;
}

function checkoutGraph(graph: DependencyGraph, projectRoot: string | undefined): DependencyGraph {
  if (projectRoot === undefined) {
    return graph;
  }
  const root = projectRoot;
  const projectPath = projectPathOf(root);
  function inProject(dependency: GraphDependency): GraphDependency {
    const resolved = normalizePath(dependency.resolved ?? '');
    const outside = resolved.startsWith('../') || path.isAbsolute(resolved);
    const mapped = outside ? projectPath(path.resolve(root, resolved)) : undefined;
    return mapped === undefined ? dependency : { ...dependency, resolved: mapped };
  }
  return {
    ...graph,
    modules: graph.modules.map((module) => ({
      ...module,
      dependencies: (module.dependencies ?? []).map(inProject),
    })),
  };
}

export function productionFilter(
  layout: CouplingLayout,
  sourceRoot: string,
): (file: string) => boolean {
  return (file) =>
    (layout.isSourceFile(file) || layout.isSourceUnderRoot(file, sourceRoot)) &&
    isReuseProductionPath(pathWithinRoot(file, sourceRoot));
}

function packageName(modulePath: string, sourceRoot: string): string {
  const relativePath = isProjectRoot(sourceRoot)
    ? modulePath
    : modulePath.slice(sourceRoot.length).replace(/^\//, '');
  return relativePath.includes('/') ? (relativePath.split('/')[0] ?? '(root)') : '(root)';
}

function sharedUsage(
  graph: DependencyGraph,
  sourceRoot: string,
  { layout, projectRoot }: { layout: CouplingLayout; projectRoot: string | undefined },
): SharedEntry[] {
  return sharedUsedByOneFeature(checkoutGraph(graph, projectRoot), {
    sourceRoot,
    isProduction: productionFilter(layout, sourceRoot),
  });
}

const defaultRoles = withPublicFace(featureRoles(featureLayout), PUBLIC_FACES.typescript);
const sharedRoots = featureLayout.sharedRoots.map((glob) => globMatcher(glob));

const HUB_LIMIT = 20;

function couplingSummary(
  moduleCount: number,
  edges: readonly GraphEdge[],
  metrics: CouplingMetrics,
): CouplingReport['summary'] {
  const runtimeCount = edges.filter((edge) => edge.kind === 'runtime').length;
  return {
    modules: moduleCount,
    dependencies: edges.length,
    runtimeDependencies: runtimeCount,
    typeOnlyDependencies: edges.length - runtimeCount,
    packages: metrics.packages.length,
  };
}

function topHubs<T extends { totalCoupling: number; fanIn: number; source: string }>(
  moduleMetrics: readonly T[],
): T[] {
  return [...moduleMetrics]
    .sort(
      (left, right) =>
        right.totalCoupling - left.totalCoupling ||
        right.fanIn - left.fanIn ||
        left.source.localeCompare(right.source),
    )
    .slice(0, HUB_LIMIT);
}

export function analyzeCoupling(
  graph: unknown,
  sourceRoot: string,
  options: CouplingOptions = {},
): CouplingReport {
  const { layout = defaultResolvedLayout, roleOf = defaultRoles } = options;
  if (!isGraph(graph)) {
    throw new TypeError('Expected a dependency-cruiser graph with a modules array');
  }

  const normalizedRoot = normalizePath(sourceRoot).replace(/\/$/, '');
  const files = graph.modules
    .map((module) => normalizePath(module.source))
    .filter((source) => layout.isSourceUnderRoot(source, normalizedRoot))
    .sort();
  const fileSet = new Set(files);
  const edges = internalEdges(graph, normalizedRoot).filter(
    (edge) => fileSet.has(edge.source) && fileSet.has(edge.target),
  );

  const metrics = computeCoupling({
    modules: files,
    edges,
    packageOf: (file) => packageName(file, normalizedRoot),
    runtime: true,
    fileOf: (file) => file,
    ...stabilityUnits({ sourceRoot: normalizedRoot, sharedRoots, roleOf }),
  });
  const moduleMetrics = metrics.modules.map(({ module, ...rest }) => ({ source: module, ...rest }));

  return {
    summary: couplingSummary(files.length, edges, metrics),
    hubs: topHubs(moduleMetrics),
    modules: moduleMetrics,
    moduleImports: edges.map(({ source, target, kind }) => ({
      from: source,
      to: target,
      typeOnly: kind !== 'runtime',
    })),
    packages: metrics.packages,
    stabilityDirection: metrics.stabilityDirection,
    sharedUsedByOneFeature: sharedUsage(graph, normalizedRoot, {
      projectRoot: options.projectRoot,
      layout,
    }),
  };
}
