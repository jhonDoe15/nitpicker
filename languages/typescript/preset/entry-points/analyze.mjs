import path from 'node:path';
import { internalEdges, normalizePath } from '../dependency-graph/cruise.mjs';
import { defaultResolvedLayout } from '../layout.mjs';

const DEFAULT_FOUNDATION_DIRECTORIES = new Set(['shared', 'utils']);
const COMPOSITION_ROOT_NAMES = ['composition-root', 'main', 'server'];
const CONCRETE_NAME = '(?:client|pool|cache|store|scheduler|transport|adapter|service)';

function defaultCompositionRoots(layout) {
  return new Set(
    COMPOSITION_ROOT_NAMES.flatMap((name) =>
      layout.entryExtensions.map((extension) => `${name}.${extension}`),
    ),
  );
}

function concreteFilePattern(layout) {
  return new RegExp(`${CONCRETE_NAME}\\.[cm]?${layout.javascript ? '[jt]s' : 'ts'}$`, 'i');
}

function declaredEntryPoints({ components, productionModules, root, layout }) {
  const candidates = [...components].map((component) => [
    component,
    layout.entryExtensions
      .map((extension) => `${root}/${component}/index.${extension}`)
      .find((candidate) => productionModules.includes(candidate)),
  ]);
  return new Map(candidates.filter(([, entryPoint]) => entryPoint !== undefined));
}

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

function exportedTargetsOf(module, sourceRoot) {
  return (module.dependencies ?? [])
    .filter(
      (dependency) =>
        typeof dependency.resolved === 'string' &&
        dependency.dependencyTypes?.includes('export') === true,
    )
    .map((dependency) => normalizePath(dependency.resolved))
    .filter((target) => target.startsWith(`${sourceRoot}/`));
}

function exportTargetsBySource(graph, sourceRoot) {
  const exportTargets = new Map();
  for (const module of graph.modules) {
    const source = normalizePath(module.source);
    if (!source.startsWith(`${sourceRoot}/`)) continue;
    for (const target of exportedTargetsOf(module, sourceRoot)) {
      const targets = exportTargets.get(source) ?? new Set();
      targets.add(target);
      exportTargets.set(source, targets);
    }
  }
  return exportTargets;
}

function exportReachability(graph, sourceRoot) {
  const exportTargets = exportTargetsBySource(graph, sourceRoot);

  return (entryPoint, target) => {
    const pending = [entryPoint];
    const visited = new Set();
    for (const current of pending) {
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

function normalizedSourceRoot(sources, requestedRoot, layout) {
  const legacyRoot = `${requestedRoot}/main`;
  const legacyOnly =
    layout.sourceRoots.includes(requestedRoot) &&
    sources.some((source) => layout.isSourceUnderRoot(source, legacyRoot)) &&
    !sources.some(
      (source) =>
        layout.isSourceUnderRoot(source, requestedRoot) && !source.startsWith(`${legacyRoot}/`),
    );
  return legacyOnly ? legacyRoot : requestedRoot;
}

function entryPointScope(graph, sourceRoot, options) {
  if (!Array.isArray(graph?.modules))
    throw new TypeError('Expected a dependency-cruiser graph with a modules array');
  const { layout, foundationDirectories } = options;
  const sources = graph.modules.map((module) => normalizePath(module.source));
  const root = normalizedSourceRoot(sources, normalizePath(sourceRoot).replace(/\/$/, ''), layout);
  const productionModules = sources.filter(
    (source) => source.startsWith(`${root}/`) && isProductionModule(source, root, layout),
  );
  const components = new Set(
    productionModules
      .map((source) => componentName(source, root))
      .filter((name) => name !== '(root)' && !foundationDirectories.has(name)),
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

function crossBoundaryFinding(edge, scope) {
  if (
    !isProductionModule(edge.source, scope.root, scope.layout) ||
    !isProductionModule(edge.target, scope.root, scope.layout)
  )
    return undefined;
  const sourceComponent = componentName(edge.source, scope.root);
  const targetComponent = componentName(edge.target, scope.root);
  if (
    scope.compositionRoots.has(relativeToRoot(edge.source, scope.root)) ||
    sourceComponent === targetComponent ||
    !scope.components.has(targetComponent)
  )
    return undefined;
  return {
    source: edge.source,
    target: edge.target,
    sourceComponent,
    targetComponent,
    dependencyKind: edge.kind,
  };
}

function recordBoundaryFinding(finding, scope, groups) {
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

function boundaryImports(scope) {
  const groups = {
    throughEntryPoint: [],
    publicAlternativeBypasses: [],
    unexportedTargetImports: [],
    missingEntryPointImports: [],
    concreteCrossBoundaryImports: [],
  };
  for (const edge of internalEdges(scope.graph, scope.root)) {
    const finding = crossBoundaryFinding(edge, scope);
    if (!finding) continue;
    recordBoundaryFinding(finding, scope, groups);
    if (concreteFilePattern(scope.layout).test(path.basename(edge.target)))
      groups.concreteCrossBoundaryImports.push(finding);
  }
  for (const findings of Object.values(groups)) findings.sort(byLocation);
  return groups;
}

export function analyzeEntryPoints(
  graph,
  sourceRoot,
  {
    layout = defaultResolvedLayout,
    foundationDirectories = DEFAULT_FOUNDATION_DIRECTORIES,
    compositionRoots = defaultCompositionRoots(layout),
  } = {},
) {
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
