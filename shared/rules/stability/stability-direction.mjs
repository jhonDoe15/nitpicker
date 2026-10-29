import { MESSAGES, renderMessage } from '../../policy.mjs';
import { causeIndex } from './stability-cause.mjs';

const OTHER = { kind: 'other' };
const WIRING = 'wiring';
const ROUNDING = 10_000;

export function rounded(value) {
  return Math.round(value * ROUNDING) / ROUNDING;
}

function unitInstabilityOf(fanIn, fanOut) {
  return fanIn + fanOut === 0 ? undefined : rounded(fanOut / (fanIn + fanOut));
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

function graphContext({ modules, packageOf, groupOf = packageOf, roleOf, ...naming }) {
  const role = remembered((module) => roleOf?.(module) ?? OTHER);
  const group = remembered(groupOf);
  function unitOf(module) {
    const found = role(module);
    return found.kind === 'feature' ? found.directory : group(module);
  }
  const facePackages = new Map();
  for (const module of modules.filter((entry) => role(entry).isPublic === true)) {
    addTo(facePackages, role(module).directory, group(module));
  }
  const groupNoun = naming.groupNoun ?? 'package';
  function labelOf(level, module) {
    const found = role(module);
    return level === 'unit' && found.kind === 'feature'
      ? `feature ${found.directory}`
      : `${groupNoun} ${group(module)}`;
  }
  const fileOf = naming.fileOf ?? ((module) => module);
  return { modules, role, group, unitOf, facePackages, labelOf, fileOf };
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
  return (unit) => unitInstabilityOf(fanIn.get(unit)?.size ?? 0, fanOut.get(unit)?.size ?? 0);
}

function insideOneFeature(edge, context) {
  const source = context.role(edge.source);
  const target = context.role(edge.target);
  return (
    source.kind === 'feature' && target.kind === 'feature' && source.directory === target.directory
  );
}

function pairOf(edge, context) {
  const sourceGroup = context.group(edge.source);
  const targetGroup = context.group(edge.target);
  if (insideOneFeature(edge, context)) {
    const faces = context.facePackages.get(context.role(edge.source).directory) ?? new Set();
    const exempt = [sourceGroup, targetGroup].some((name) => faces.has(name));
    return sourceGroup === targetGroup || exempt
      ? undefined
      : { level: 'package', source: sourceGroup, target: targetGroup, edge };
  }
  const source = context.unitOf(edge.source);
  const target = context.unitOf(edge.target);
  return source === target ? undefined : { level: 'unit', source, target, edge };
}

function featureEnds(pair, context) {
  const ends = [pair.edge.source, pair.edge.target].map((module) => context.role(module));
  return pair.level === 'unit' ? ends.map((role) => role.kind === 'feature') : [false, false];
}

function featureWording(pair, { context, sourceInstability, targetInstability }) {
  const [sourceIsFeature, targetIsFeature] = featureEnds(pair, context);
  if (!sourceIsFeature && !targetIsFeature) {
    return {};
  }
  const message = renderMessage(MESSAGES.stabilityDirectionFeature, {
    source: context.labelOf('unit', pair.edge.source),
    target: context.labelOf('unit', pair.edge.target),
    sourceInstability,
    targetInstability,
  });
  return sourceIsFeature ? { path: pair.source, message } : { message };
}

function directionOf(pair, { context, instability, causeOf }) {
  const sourceInstability = instability(pair.level, pair.source);
  const targetInstability = instability(pair.level, pair.target);
  if (
    typeof sourceInstability !== 'number' ||
    typeof targetInstability !== 'number' ||
    sourceInstability >= targetInstability
  ) {
    return [];
  }
  return [
    {
      source: pair.source,
      target: pair.target,
      sourceInstability,
      targetInstability,
      delta: rounded(targetInstability - sourceInstability),
      cause: causeOf(pair),
      ...featureWording(pair, { context, sourceInstability, targetInstability }),
    },
  ];
}

function reportedPairs(edges, context) {
  const pairs = new Map();
  const candidates = edges.filter(
    ({ kind, source }) => kind !== 'type-only' && context.role(source).kind !== WIRING,
  );
  for (const edge of candidates) {
    const pair = pairOf(edge, context);
    const key = pair === undefined ? undefined : `${pair.source}\0${pair.target}`;
    if (key !== undefined && !pairs.has(key)) {
      pairs.set(key, pair);
    }
  }
  return [...pairs.values()];
}

export function stabilityDirections({ edges, ...graph }) {
  const context = graphContext(graph);
  const byLevel = {
    package: unitInstabilities(edges, context.group),
    unit: unitInstabilities(edges, context.unitOf),
  };
  function instability(level, name) {
    return byLevel[level](name);
  }
  const causeOf = causeIndex(context, edges);
  return reportedPairs(edges, context)
    .flatMap((pair) => directionOf(pair, { context, instability, causeOf }))
    .sort((left, right) => right.delta - left.delta);
}
