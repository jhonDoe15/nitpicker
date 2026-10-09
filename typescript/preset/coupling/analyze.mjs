import { computeCoupling } from '../../shared/rules/coupling.mjs';
import { internalEdges, normalizePath } from '../dependency-graph/cruise.mjs';
import { defaultResolvedLayout } from '../layout.mjs';

function packageName(modulePath, sourceRoot) {
  const relativePath = modulePath.slice(sourceRoot.length).replace(/^\//, '');
  return relativePath.includes('/') ? relativePath.split('/')[0] : '(root)';
}

// Builds the neutral dependency graph (module -> dependencies) from the dependency-cruiser output
// and lets the shared module compute the metrics.
export function analyzeCoupling(graph, sourceRoot, { layout = defaultResolvedLayout } = {}) {
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
  };
}
