import { internalEdges, normalizePath } from '../dependency-graph/cruise.mjs';
import { defaultResolvedLayout } from '../layout.mjs';

function rounded(value) {
  return Math.round(value * 10_000) / 10_000;
}

function instability(fanIn, fanOut) {
  return fanIn + fanOut === 0 ? null : rounded(fanOut / (fanIn + fanOut));
}

function packageName(modulePath, sourceRoot) {
  const relativePath = modulePath.slice(sourceRoot.length).replace(/^\//, '');
  return relativePath.includes('/') ? relativePath.split('/')[0] : '(root)';
}

function connectedComponents(files, edges) {
  const adjacency = new Map(files.map((file) => [file, new Set()]));
  for (const edge of edges) {
    adjacency.get(edge.source)?.add(edge.target);
    adjacency.get(edge.target)?.add(edge.source);
  }

  const visited = new Set();
  const sizes = [];
  for (const file of files) {
    if (visited.has(file)) {
      continue;
    }
    let size = 0;
    const pending = [file];
    visited.add(file);
    while (pending.length > 0) {
      const current = pending.pop();
      size += 1;
      for (const neighbor of adjacency.get(current) ?? []) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          pending.push(neighbor);
        }
      }
    }
    sizes.push(size);
  }
  return sizes.sort((left, right) => right - left);
}

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

  const moduleMetrics = files.map((source) => {
    const incoming = new Set(
      edges.filter((edge) => edge.target === source).map((edge) => edge.source),
    );
    const outgoing = new Set(
      edges.filter((edge) => edge.source === source).map((edge) => edge.target),
    );
    const runtimeIncoming = new Set(
      runtimeEdges.filter((edge) => edge.target === source).map((edge) => edge.source),
    );
    const runtimeOutgoing = new Set(
      runtimeEdges.filter((edge) => edge.source === source).map((edge) => edge.target),
    );

    return {
      source,
      package: packageName(source, normalizedRoot),
      fanIn: incoming.size,
      fanOut: outgoing.size,
      totalCoupling: incoming.size + outgoing.size,
      instability: instability(incoming.size, outgoing.size),
      runtimeFanIn: runtimeIncoming.size,
      runtimeFanOut: runtimeOutgoing.size,
      runtimeInstability: instability(runtimeIncoming.size, runtimeOutgoing.size),
    };
  });

  const packageNames = new Set(files.map((file) => packageName(file, normalizedRoot)));
  const packages = [...packageNames]
    .map((name) => {
      const packageFiles = files.filter((file) => packageName(file, normalizedRoot) === name);
      const internal = edges.filter(
        (edge) =>
          packageName(edge.source, normalizedRoot) === name &&
          packageName(edge.target, normalizedRoot) === name,
      );
      const incoming = new Set(
        edges
          .filter(
            (edge) =>
              packageName(edge.source, normalizedRoot) !== name &&
              packageName(edge.target, normalizedRoot) === name,
          )
          .map((edge) => edge.source),
      );
      const outgoing = new Set(
        edges
          .filter(
            (edge) =>
              packageName(edge.source, normalizedRoot) === name &&
              packageName(edge.target, normalizedRoot) !== name,
          )
          .map((edge) => edge.target),
      );
      const componentSizes = connectedComponents(packageFiles, internal);
      const possibleInternalEdges = packageFiles.length * Math.max(packageFiles.length - 1, 0);

      return {
        name,
        modules: packageFiles.length,
        fanIn: incoming.size,
        fanOut: outgoing.size,
        instability: instability(incoming.size, outgoing.size),
        cohesion: {
          internalEdges: internal.length,
          edgeDensity:
            possibleInternalEdges === 0 ? null : rounded(internal.length / possibleInternalEdges),
          connectedComponents: componentSizes.length,
          largestComponentShare:
            packageFiles.length === 0
              ? null
              : rounded((componentSizes[0] ?? 0) / packageFiles.length),
        },
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name));

  const packageByName = new Map(packages.map((entry) => [entry.name, entry]));
  const stabilityDirection = [];
  const seenPackageEdges = new Set();
  for (const edge of edges) {
    const sourcePackage = packageName(edge.source, normalizedRoot);
    const targetPackage = packageName(edge.target, normalizedRoot);
    if (sourcePackage === targetPackage) {
      continue;
    }
    const key = `${sourcePackage}\0${targetPackage}`;
    if (seenPackageEdges.has(key)) {
      continue;
    }
    seenPackageEdges.add(key);
    const sourceInstability = packageByName.get(sourcePackage)?.instability;
    const targetInstability = packageByName.get(targetPackage)?.instability;
    if (
      sourceInstability !== null &&
      sourceInstability !== undefined &&
      targetInstability !== null &&
      targetInstability !== undefined &&
      sourceInstability < targetInstability
    ) {
      stabilityDirection.push({
        source: sourcePackage,
        target: targetPackage,
        sourceInstability,
        targetInstability,
        delta: rounded(targetInstability - sourceInstability),
      });
    }
  }
  stabilityDirection.sort((left, right) => right.delta - left.delta);

  return {
    summary: {
      modules: files.length,
      dependencies: edges.length,
      runtimeDependencies: runtimeEdges.length,
      typeOnlyDependencies: edges.length - runtimeEdges.length,
      packages: packages.length,
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
    packages,
    stabilityDirection,
  };
}
