import { appendAll } from '../../lists/lists.mts';
import { fieldOf, listOf, textOf } from '../../values/readers.mts';

const MAX_CYCLE_CLASSES = 6;
const MAX_PATHS = 5000;

export type MemberEdgeShape = {
  readonly from: string;
  readonly to: string;
  readonly file: string;
  readonly line: number;
  readonly field: string;
  readonly many: boolean;
};

type Walk<E> = {
  path: readonly E[];
  seen: ReadonlySet<string>;
  start: string;
  rank: ReadonlyMap<string, number>;
};

function byPosition(
  left: { file: string; line: number },
  right: { file: string; line: number },
): number {
  return left.file.localeCompare(right.file) || left.line - right.line;
}

function earliest<E extends MemberEdgeShape>(edges: readonly E[]): E | undefined {
  return edges.reduce<E | undefined>(
    (best, edge) => (best === undefined || byPosition(edge, best) < 0 ? edge : best),
    undefined,
  );
}

function latest<E extends MemberEdgeShape>(edges: readonly E[]): E | undefined {
  return edges.reduce<E | undefined>(
    (best, edge) => (best === undefined || byPosition(edge, best) >= 0 ? edge : best),
    undefined,
  );
}

function outgoing<E extends MemberEdgeShape>(edges: readonly E[]): Map<string, E[]> {
  const from = new Map<string, E[]>();
  for (const edge of edges) {
    from.set(edge.from, [...(from.get(edge.from) ?? []), edge]);
  }
  return from;
}

function closingEdge<E extends MemberEdgeShape>(cycle: readonly E[]): E | undefined {
  const single = cycle.filter((edge) => !edge.many);
  const candidates = single.length > 0 ? single : cycle;
  return latest(candidates);
}

function selfCycles<E extends MemberEdgeShape>(edges: readonly E[]): E[][] {
  const byClass = outgoing(edges.filter((edge) => edge.from === edge.to));
  return [...byClass.values()].flatMap((own) => {
    const firstSingle = earliest(own.filter((edge) => !edge.many));
    const firstMany = earliest(own.filter((edge) => edge.many));
    return firstSingle !== undefined && firstMany !== undefined ? [[firstMany, firstSingle]] : [];
  });
}

function opens<E extends MemberEdgeShape>(edge: E, { path, seen, start, rank }: Walk<E>): boolean {
  return (
    !seen.has(edge.to) &&
    (rank.get(edge.to) ?? -1) > (rank.get(start) ?? Number.NaN) &&
    path.length + 1 < MAX_CYCLE_CLASSES
  );
}

function cyclesFrom<E extends MemberEdgeShape>(
  start: string,
  { from, rank }: { from: ReadonlyMap<string, E[]>; rank: ReadonlyMap<string, number> },
): E[][] {
  const cycles: E[][] = [];
  const pending = (from.get(start) ?? [])
    .filter((edge) => opens(edge, { path: [], seen: new Set([start]), start, rank }))
    .map((edge): { path: readonly E[]; seen: ReadonlySet<string> } => ({
      path: [edge],
      seen: new Set([start, edge.to]),
    }));
  for (const { path, seen } of pending) {
    const next = from.get(path.at(-1)?.to ?? '') ?? [];
    appendAll(
      cycles,
      next.filter((edge) => edge.to === start).map((edge) => [...path, edge]),
    );
    const open = next.filter((edge) => opens(edge, { path, seen, start, rank }));
    appendAll(
      pending,
      open
        .slice(0, Math.max(0, MAX_PATHS - pending.length))
        .map((edge) => ({ path: [...path, edge], seen: new Set([...seen, edge.to]) })),
    );
  }
  return cycles;
}

function longerCycles<E extends MemberEdgeShape>(edges: readonly E[]): E[][] {
  const from = outgoing(edges.filter((edge) => edge.from !== edge.to));
  const order = [...from.keys()].sort();
  const rank = new Map(order.map((name, index) => [name, index]));
  return order.flatMap((start) => cyclesFrom(start, { from, rank }));
}

export function memberCycles<E extends MemberEdgeShape>(
  edges: readonly E[],
): { edge: E; cycle: E[] }[] {
  const closing = new Map<string, { edge: E; cycle: E[] }>();
  for (const cycle of [...selfCycles(edges), ...longerCycles(edges)]) {
    const edge = closingEdge(cycle);
    if (edge === undefined) {
      continue;
    }
    const key = `${edge.file}\0${String(edge.line)}\0${edge.field}`;
    if (!closing.has(key)) {
      closing.set(key, { edge, cycle });
    }
  }
  return [...closing.values()].toSorted((left, right) => byPosition(left.edge, right.edge));
}

export function cycleText(cycle: unknown, edge: unknown): string {
  const steps = listOf(cycle);
  const start = steps.indexOf(edge) + 1;
  const ordered = [...steps.slice(start), ...steps.slice(0, start)];
  return [
    ...ordered.map(
      (step) => `${textOf(fieldOf(step, 'fromName'))}.${textOf(fieldOf(step, 'field'))}`,
    ),
    textOf(fieldOf(ordered.at(-1), 'toName')),
  ].join(' -> ');
}
