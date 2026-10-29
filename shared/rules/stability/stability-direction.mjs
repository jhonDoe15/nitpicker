export const STABILITY_FIX =
  "Depend on the other side's public face, or move the code that joins them into the composition root.";

const OTHER = { kind: 'other' };

export function rounded(value) {
  return Math.round(value * 10_000) / 10_000;
}

export function instabilityOf(fanIn, fanOut) {
  return fanIn + fanOut === 0 ? null : rounded(fanOut / (fanIn + fanOut));
}

function remembered(compute) {
  const cache = new Map();
  return (key) => {
    if (!cache.has(key)) {
      cache.set(key, compute(key));
    }
    return cache.get(key);
  };
}

function addTo(map, key, value) {
  const values = map.get(key) ?? new Set();
  values.add(value);
  map.set(key, values);
}

function graphContext({ modules, packageOf, roleOf, fileOf = (module) => module }) {
  const role = remembered((module) => roleOf?.(module) ?? OTHER);
  const unitOf = (module) => {
    const found = role(module);
    return found.kind === 'feature' ? found.directory : packageOf(module);
  };
  const facePackages = new Map();
  for (const module of modules.filter((entry) => role(entry).isPublic === true)) {
    addTo(facePackages, role(module).directory, packageOf(module));
  }
  const features = new Set(
    modules.map((module) => role(module)).flatMap((found) => found.directory ?? []),
  );
  return { modules, packageOf, fileOf, role, unitOf, facePackages, features };
}

function unitInstabilities(edges, unitOf) {
  const fanIn = new Map();
  const fanOut = new Map();
  for (const { source, target } of edges.filter(
    (edge) => unitOf(edge.source) !== unitOf(edge.target),
  )) {
    addTo(fanIn, unitOf(target), source);
    addTo(fanOut, unitOf(source), target);
  }
  return (unit) => instabilityOf(fanIn.get(unit)?.size ?? 0, fanOut.get(unit)?.size ?? 0);
}

function insideOneFeature(edge, context) {
  const source = context.role(edge.source);
  const target = context.role(edge.target);
  return (
    source.kind === 'feature' && target.kind === 'feature' && source.directory === target.directory
  );
}

function pairOf(edge, context) {
  const sourcePackage = context.packageOf(edge.source);
  const targetPackage = context.packageOf(edge.target);
  if (insideOneFeature(edge, context)) {
    const faces = context.facePackages.get(context.role(edge.source).directory) ?? new Set();
    const exempt = [sourcePackage, targetPackage].some((name) => faces.has(name));
    return sourcePackage === targetPackage || exempt
      ? undefined
      : { level: 'package', source: sourcePackage, target: targetPackage };
  }
  const source = context.unitOf(edge.source);
  const target = context.unitOf(edge.target);
  return source === target ? undefined : { level: 'unit', source, target };
}

function endMembers(context, { level, name }) {
  const groupOf = level === 'package' ? context.packageOf : context.unitOf;
  return context.modules.filter((module) => groupOf(module) === name);
}

function unitLabel(context, module) {
  const role = context.role(module);
  return role.kind === 'feature' ? `feature ${role.name}` : `package ${context.packageOf(module)}`;
}

function neighbours(members, edges) {
  const inside = new Set(members);
  return edges.flatMap(({ source, target }) => {
    if (inside.has(source) === inside.has(target)) {
      return [];
    }
    return [inside.has(source) ? target : source];
  });
}

function causeOf(pair, { context, edges }) {
  const sourceMembers = endMembers(context, { level: pair.level, name: pair.source });
  const targetMembers = endMembers(context, { level: pair.level, name: pair.target });
  const outside = [...neighbours(sourceMembers, edges), ...neighbours(targetMembers, edges)];
  const contributors = new Map(
    [...targetMembers, ...outside]
      .filter((module) => !sourceMembers.includes(module))
      .map((module) => [context.fileOf(module), unitLabel(context, module)]),
  );
  return {
    files: sourceMembers.map((module) => context.fileOf(module)).sort(),
    contributors: [...contributors]
      .map(([file, unit]) => ({ file, unit }))
      .sort((left, right) => left.file.localeCompare(right.file)),
  };
}

function featureWording(pair, context) {
  const describe = (name) => {
    const module = endMembers(context, { level: pair.level, name })[0];
    const role = context.role(module);
    return role.kind === 'feature' ? `feature ${role.name} (${role.directory})` : `package ${name}`;
  };
  const [source, target] = [describe(pair.source), describe(pair.target)];
  const sentence = `${source[0].toUpperCase()}${source.slice(1)} depends on less stable ${target}`;
  return { path: pair.source, message: `${sentence}. ${STABILITY_FIX}` };
}

function directionOf(pair, { context, edges, instability }) {
  const sourceInstability = instability(pair);
  const targetInstability = instability({ ...pair, source: pair.target });
  if (
    typeof sourceInstability !== 'number' ||
    typeof targetInstability !== 'number' ||
    sourceInstability >= targetInstability
  ) {
    return [];
  }
  const featureEnd =
    pair.level === 'unit' && [pair.source, pair.target].some((name) => context.features.has(name));
  return [
    {
      source: pair.source,
      target: pair.target,
      sourceInstability,
      targetInstability,
      delta: rounded(targetInstability - sourceInstability),
      cause: causeOf(pair, { context, edges }),
      ...(featureEnd ? featureWording(pair, context) : {}),
    },
  ];
}

export function stabilityDirections({ edges, packages, ...graph }) {
  const context = graphContext(graph);
  const packageInstability = new Map(packages.map((entry) => [entry.name, entry.instability]));
  const unitInstability = unitInstabilities(edges, context.unitOf);
  const instability = ({ level, source }) =>
    level === 'package' ? packageInstability.get(source) : unitInstability(source);
  const pairs = new Map();
  for (const edge of edges.filter(({ kind }) => kind !== 'type-only')) {
    const pair = pairOf(edge, context);
    if (pair !== undefined) {
      pairs.set(`${pair.level}\0${pair.source}\0${pair.target}`, pair);
    }
  }
  return [...pairs.values()]
    .flatMap((pair) => directionOf(pair, { context, edges, instability }))
    .sort((left, right) => right.delta - left.delta);
}
