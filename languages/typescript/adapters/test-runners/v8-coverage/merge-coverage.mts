import { fieldOf, fieldsOf, listOf } from '../../../../../shared/values/readers.mts';

type Start = { readonly line: number; readonly column: number };

export type Coverage = Readonly<Record<string, unknown>>;

type CoverageKind = {
  readonly map: string;
  readonly counts: string;
  readonly type: (entry: unknown) => string;
  readonly start: (entry: unknown) => Start;
};

type Keyed = {
  readonly key: string;
  readonly entry: unknown;
  readonly start: Start;
  readonly count: unknown;
};

function startOf(location: unknown): Start {
  return { line: Number(fieldOf(location, 'line')), column: Number(fieldOf(location, 'column')) };
}

const MAPS: readonly CoverageKind[] = [
  {
    map: 'statementMap',
    counts: 's',
    type: () => 'statement',
    start: (entry) => startOf(fieldOf(entry, 'start')),
  },
  {
    map: 'fnMap',
    counts: 'f',
    type: () => 'function',
    start: (entry) => startOf(fieldOf(fieldOf(entry, 'loc'), 'start')),
  },
  {
    map: 'branchMap',
    counts: 'b',
    type: (entry) => String(fieldOf(entry, 'type')),
    start: (entry) => startOf(fieldOf(fieldOf(entry, 'loc'), 'start')),
  },
];

function byStart(left: { readonly start: Start }, right: { readonly start: Start }): number {
  return left.start.line - right.start.line || left.start.column - right.start.column;
}

function keyedEntries(coverage: Coverage, kind: CoverageKind): Keyed[] {
  const entries = Object.entries(fieldsOf(coverage[kind.map]))
    .map(([index, entry]) => ({ index, entry, start: kind.start(entry) }))
    .toSorted(byStart);
  const seen = new Map<string, number>();
  const counts = fieldsOf(coverage[kind.counts]);
  return entries.map(({ index, entry, start }) => {
    const line = `${kind.type(entry)}@${String(start.line)}`;
    const ordinal = seen.get(line) ?? 0;
    seen.set(line, ordinal + 1);
    return { key: `${line}#${String(ordinal)}`, entry, start, count: counts[index] };
  });
}

function summed(left: unknown, right: unknown): unknown {
  if (!Array.isArray(left)) {
    return Number(left) + Number(right);
  }
  const leftCounts = listOf(left);
  const rightCounts = listOf(right);
  const longer = leftCounts.length >= rightCounts.length ? leftCounts : rightCounts;
  return longer.map((_, index) => Number(leftCounts[index] ?? 0) + Number(rightCounts[index] ?? 0));
}

function mergedEntries(known: Coverage, next: Coverage, kind: CoverageKind): Coverage {
  const merged = new Map(keyedEntries(known, kind).map((item) => [item.key, item]));
  for (const item of keyedEntries(next, kind)) {
    const present = merged.get(item.key);
    merged.set(
      item.key,
      present === undefined ? item : { ...present, count: summed(present.count, item.count) },
    );
  }
  const items = [...merged.values()].toSorted(byStart);
  return {
    [kind.map]: Object.fromEntries(items.map(({ entry }, index) => [index, entry])),
    [kind.counts]: Object.fromEntries(items.map(({ count }, index) => [index, count])),
  };
}

export function mergedCoverage(known: Coverage | undefined, next: Coverage): Coverage {
  if (known === undefined) {
    return next;
  }
  return {
    ...known,
    ...Object.fromEntries(MAPS.flatMap((kind) => Object.entries(mergedEntries(known, next, kind)))),
  };
}
