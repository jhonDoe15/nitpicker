import { MESSAGES, renderMessage } from '../../policy.mts';
import { causeIndex } from './stability-cause.mts';
import { remembered, setMap } from './graph-maps.mts';
import type { RoleLike } from '../features/typed/role-types.mts';
import type {
  GraphContext,
  Level,
  StabilityDirection,
  StabilityEdge,
  StabilityGraph,
} from './stability-types.mts';

type Pair = {
  readonly level: Level;
  readonly source: string;
  readonly target: string;
  readonly edge: StabilityEdge;
};

type Instability = (level: Level, name: string) => number | undefined;

type DirectionContext = {
  readonly context: GraphContext;
  readonly instability: Instability;
  readonly causeOf: ReturnType<typeof causeIndex>;
};

const OTHER: RoleLike = { kind: 'other' };
const WIRING = 'wiring';
const ROUNDING = 10_000;

export function rounded(value: number): number {
  return Math.round(value * ROUNDING) / ROUNDING;
}

function unitInstabilityOf(fanIn: number, fanOut: number): number | undefined {
  return fanIn + fanOut === 0 ? undefined : rounded(fanOut / (fanIn + fanOut));
}

function graphContext({
  modules,
  packageOf,
  groupOf = packageOf,
  roleOf,
  ...naming
}: Omit<StabilityGraph, 'edges'>): GraphContext {
  const role = remembered((module: string) => roleOf?.(module) ?? OTHER);
  const group = remembered(groupOf);
  function unitOf(module: string): string {
    const found = role(module);
    return found.kind === 'feature' && found.directory !== undefined
      ? found.directory
      : group(module);
  }
  const facePackages = setMap(
    modules
      .filter((entry) => role(entry).isPublic === true)
      .map((module): [string | undefined, string] => [role(module).directory, group(module)]),
  );
  const groupNoun = naming.groupNoun ?? 'package';
  function labelOf(level: Level, module: string): string {
    const found = role(module);
    return level === 'unit' && found.kind === 'feature'
      ? `feature ${found.directory ?? ''}`
      : `${groupNoun} ${group(module)}`;
  }
  function fileOf(module: string): string {
    return naming.fileOf?.(module) ?? module;
  }
  return { modules, role, group, unitOf, facePackages, labelOf, fileOf };
}

function unitInstabilities(
  edges: readonly StabilityEdge[],
  unitOf: (module: string) => string,
): (unit: string) => number | undefined {
  const crossing = edges.filter((edge) => unitOf(edge.source) !== unitOf(edge.target));
  const fanIn = setMap(
    crossing.map(({ source, target }): [string, string] => [unitOf(target), source]),
  );
  const fanOut = setMap(
    crossing.map(({ source, target }): [string, string] => [unitOf(source), target]),
  );
  return (unit) => unitInstabilityOf(fanIn.get(unit)?.size ?? 0, fanOut.get(unit)?.size ?? 0);
}

function insideOneFeature(edge: StabilityEdge, context: GraphContext): boolean {
  const source = context.role(edge.source);
  const target = context.role(edge.target);
  return (
    source.kind === 'feature' && target.kind === 'feature' && source.directory === target.directory
  );
}

function pairOf(edge: StabilityEdge, context: GraphContext): Pair | undefined {
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

function featureEnds(pair: Pair, context: GraphContext): boolean[] {
  const ends = [pair.edge.source, pair.edge.target].map((module) => context.role(module));
  return pair.level === 'unit' ? ends.map((role) => role.kind === 'feature') : [false, false];
}

function featureWording(
  pair: Pair,
  {
    context,
    sourceInstability,
    targetInstability,
  }: {
    readonly context: GraphContext;
    readonly sourceInstability: number;
    readonly targetInstability: number;
  },
): { readonly path?: string; readonly message?: string } {
  const [sourceIsFeature = false, targetIsFeature = false] = featureEnds(pair, context);
  if (!(sourceIsFeature || targetIsFeature)) {
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

function directionOf(
  pair: Pair,
  { context, instability, causeOf }: DirectionContext,
): StabilityDirection[] {
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

function reportedPairs(edges: readonly StabilityEdge[], context: GraphContext): Pair[] {
  const pairs = new Map<string, Pair>();
  const candidates = edges.filter(
    ({ kind, source }) => kind !== 'type-only' && context.role(source).kind !== WIRING,
  );
  for (const edge of candidates) {
    const pair = pairOf(edge, context);
    if (pair === undefined) {
      continue;
    }
    const key = JSON.stringify([pair.source, pair.target]);
    if (!pairs.has(key)) {
      pairs.set(key, pair);
    }
  }
  return [...pairs.values()];
}

export function stabilityDirections({ edges, ...graph }: StabilityGraph): StabilityDirection[] {
  const context = graphContext(graph);
  const byLevel = {
    package: unitInstabilities(edges, context.group),
    unit: unitInstabilities(edges, context.unitOf),
  };
  function instability(level: Level, name: string): number | undefined {
    return byLevel[level](name);
  }
  const causeOf = causeIndex(context, edges);
  return reportedPairs(edges, context)
    .flatMap((pair) => directionOf(pair, { context, instability, causeOf }))
    .sort((left, right) => right.delta - left.delta);
}
