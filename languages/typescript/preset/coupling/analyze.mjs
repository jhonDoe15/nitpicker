import path from 'node:path';
import { computeCoupling } from '../../../../shared/rules/coupling.mjs';
import { internalEdges, normalizePath } from '../dependency-graph/cruise.mjs';
import { defaultResolvedLayout } from '../layout.mjs';
import { isReuseProductionPath, projectPathOf } from '../structure/reuse/reuse-paths.mjs';
import { sharedUsedByOneFeature } from './shared-usage.mjs';
import {
  featureRoles,
  PUBLIC_FACES,
  withPublicFace,
} from '../../../../shared/rules/features/feature-roles.mjs';
import { globMatcher } from '../../../../shared/paths/glob.mjs';
import { featureLayout } from '../architecture/strict-layout.mjs';
import { stabilityUnits } from './feature-layout.mjs';

function pathWithinRoot(file, sourceRoot) {
  return file.startsWith(`${sourceRoot}/`) ? file.slice(sourceRoot.length + 1) : file;
}

function checkoutGraph(graph, projectRoot) {
  if (projectRoot === undefined) return graph;
  const projectPath = projectPathOf(projectRoot);
  function inProject(dependency) {
    const resolved = normalizePath(dependency.resolved ?? '');
    const outside = resolved.startsWith('../') || path.isAbsolute(resolved);
    const mapped = outside ? projectPath(path.resolve(projectRoot, resolved)) : undefined;
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

function productionFilter(layout, sourceRoot) {
  return (file) =>
    (layout.isSourceFile(file) || layout.isSourceUnderRoot(file, sourceRoot)) &&
    isReuseProductionPath(pathWithinRoot(file, sourceRoot));
}

function packageName(modulePath, sourceRoot) {
  const relativePath = modulePath.slice(sourceRoot.length).replace(/^\//, '');
  return relativePath.includes('/') ? relativePath.split('/')[0] : '(root)';
}

function sharedUsage(graph, sourceRoot, { layout, projectRoot }) {
  return sharedUsedByOneFeature(checkoutGraph(graph, projectRoot), {
    sourceRoot,
    isProduction: productionFilter(layout, sourceRoot),
  });
}

const defaultRoles = withPublicFace(featureRoles(featureLayout), PUBLIC_FACES.typescript);
const sharedRoots = featureLayout.sharedRoots.map((glob) => globMatcher(glob));

export function analyzeCoupling(graph, sourceRoot, options = {}) {
  const { layout = defaultResolvedLayout, roleOf = defaultRoles } = options;
  if (!Array.isArray(graph?.modules)) {
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
  const runtimeEdges = edges.filter((edge) => edge.kind === 'runtime');

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
    summary: {
      modules: files.length,
      dependencies: edges.length,
      runtimeDependencies: runtimeEdges.length,
      typeOnlyDependencies: edges.length - runtimeEdges.length,
      packages: metrics.packages.length,
    },
    hubs: [...moduleMetrics]
      .sort(
        (left, right) =>
          right.totalCoupling - left.totalCoupling ||
          right.fanIn - left.fanIn ||
          left.source.localeCompare(right.source),
      )
      .slice(0, 20),
    modules: moduleMetrics,
    packages: metrics.packages,
    stabilityDirection: metrics.stabilityDirection,
    sharedUsedByOneFeature: sharedUsage(graph, normalizedRoot, { ...options, layout }),
  };
}
