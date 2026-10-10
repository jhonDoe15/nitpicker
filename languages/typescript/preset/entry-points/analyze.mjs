import path from 'node:path';
import { internalEdges, normalizePath } from '../dependency-graph/cruise.mjs';
import { defaultResolvedLayout } from '../layout.mjs';

const DEFAULT_FOUNDATION_DIRECTORIES = new Set(['shared', 'utils']);
const DEFAULT_COMPOSITION_ROOTS = new Set(['composition-root.ts', 'main.ts', 'server.ts']);
const CONCRETE_FILE = /(?:client|pool|cache|store|scheduler|transport|adapter|service)\.[cm]?ts$/i;

function relativeToRoot(modulePath, sourceRoot) {
  return modulePath.slice(sourceRoot.length).replace(/^\//, '');
}

function componentName(modulePath, sourceRoot) {
  const relativePath = relativeToRoot(modulePath, sourceRoot);
  return relativePath.includes('/') ? relativePath.split('/')[0] : '(root)';
}

function isProductionModule(modulePath, sourceRoot, layout) {
  return layout.isSourceUnderRoot(modulePath, sourceRoot);
}

function exportReachability(graph, sourceRoot) {
  const exportTargets = new Map();
  for (const module of graph.modules) {
    const source = normalizePath(module.source);
    if (!source.startsWith(`${sourceRoot}/`)) {
      continue;
    }
    for (const dependency of module.dependencies ?? []) {
      if (
        typeof dependency.resolved !== 'string' ||
        dependency.dependencyTypes?.includes('export') !== true
      ) {
        continue;
      }
      const target = normalizePath(dependency.resolved);
      if (target.startsWith(`${sourceRoot}/`)) {
        const targets = exportTargets.get(source) ?? new Set();
        targets.add(target);
        exportTargets.set(source, targets);
      }
    }
  }

  return (entryPoint, target) => {
    const pending = [entryPoint];
    const visited = new Set();
    while (pending.length > 0) {
      const current = pending.pop();
      if (current === target) {
        return true;
      }
      if (visited.has(current)) {
        continue;
      }
      visited.add(current);
      pending.push(...(exportTargets.get(current) ?? []));
    }
    return false;
  };
}

function byLocation(left, right) {
  return left.source.localeCompare(right.source) || left.target.localeCompare(right.target);
}

export function analyzeEntryPoints(
  graph,
  sourceRoot,
  {
    foundationDirectories = DEFAULT_FOUNDATION_DIRECTORIES,
    compositionRoots = DEFAULT_COMPOSITION_ROOTS,
    layout = defaultResolvedLayout,
  } = {},
) {
  if (!Array.isArray(graph?.modules)) {
    throw new TypeError('Expected a dependency-cruiser graph with a modules array');
  }

  const requestedRoot = normalizePath(sourceRoot).replace(/\/$/, '');
  const legacyRoot = `${requestedRoot}/main`;
  const sources = graph.modules.map((module) => normalizePath(module.source));
  const normalizedRoot =
    layout.sourceRoots.includes(requestedRoot) &&
    sources.some((source) => layout.isSourceUnderRoot(source, legacyRoot)) &&
    !sources.some(
      (source) =>
        layout.isSourceUnderRoot(source, requestedRoot) && !source.startsWith(`${legacyRoot}/`),
    )
      ? legacyRoot
      : requestedRoot;
  const productionModules = graph.modules
    .map((module) => normalizePath(module.source))
    .filter(
      (source) =>
        source.startsWith(`${normalizedRoot}/`) &&
        isProductionModule(source, normalizedRoot, layout),
    );
  const components = new Set(
    productionModules
      .map((source) => componentName(source, normalizedRoot))
      .filter((name) => name !== '(root)' && !foundationDirectories.has(name)),
  );
  const entryPoints = new Map(
    [...components]
      .map((component) => [component, `${normalizedRoot}/${component}/index.ts`])
      .filter(([, entryPoint]) => productionModules.includes(entryPoint)),
  );
  const isExportReachable = exportReachability(graph, normalizedRoot);

  const throughEntryPoint = [];
  const bypasses = [];
  const unexportedTargets = [];
  const missingEntryPoints = [];
  const concreteCrossBoundaryImports = [];

  for (const edge of internalEdges(graph, normalizedRoot)) {
    if (
      !isProductionModule(edge.source, normalizedRoot, layout) ||
      !isProductionModule(edge.target, normalizedRoot, layout)
    ) {
      continue;
    }
    const sourceComponent = componentName(edge.source, normalizedRoot);
    const targetComponent = componentName(edge.target, normalizedRoot);
    if (
      compositionRoots.has(relativeToRoot(edge.source, normalizedRoot)) ||
      sourceComponent === targetComponent ||
      !components.has(targetComponent)
    ) {
      continue;
    }

    const finding = {
      source: edge.source,
      target: edge.target,
      sourceComponent,
      targetComponent,
      dependencyKind: edge.kind,
    };
    const entryPoint = entryPoints.get(targetComponent);
    if (entryPoint === undefined) {
      missingEntryPoints.push(finding);
    } else if (edge.target === entryPoint) {
      throughEntryPoint.push(finding);
    } else if (isExportReachable(entryPoint, edge.target)) {
      bypasses.push({ ...finding, publicEntryPoint: entryPoint });
    } else {
      unexportedTargets.push({ ...finding, publicEntryPoint: entryPoint });
    }

    if (CONCRETE_FILE.test(path.basename(edge.target))) {
      concreteCrossBoundaryImports.push(finding);
    }
  }

  for (const findings of [
    throughEntryPoint,
    bypasses,
    unexportedTargets,
    missingEntryPoints,
    concreteCrossBoundaryImports,
  ]) {
    findings.sort(byLocation);
  }

  return {
    summary: {
      productionModules: productionModules.length,
      components: components.size,
      declaredEntryPoints: entryPoints.size,
      throughEntryPoint: throughEntryPoint.length,
      publicAlternativeBypasses: bypasses.length,
      unexportedTargetImports: unexportedTargets.length,
      missingEntryPointImports: missingEntryPoints.length,
      concreteCrossBoundaryImports: concreteCrossBoundaryImports.length,
    },
    components: [...components].sort(),
    throughEntryPoint,
    publicAlternativeBypasses: bypasses,
    unexportedTargetImports: unexportedTargets,
    missingEntryPointImports: missingEntryPoints,
    concreteCrossBoundaryImports,
  };
}
