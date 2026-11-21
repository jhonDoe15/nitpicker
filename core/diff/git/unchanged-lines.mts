import type {
  Alignment,
  CarriedLine,
  Hunk,
  HunkTuple,
  LineMap,
  LinePosition,
  LineSource,
  Span,
} from './line-types.mts';
import {
  agnosticTextOf,
  alignedPairs,
  chainFrom,
  describedLinesOf,
  languageOfPath,
  movedLinesOf,
  type LineToken,
} from './source-views.mts';
import type {
  DescribedLine,
  MovedContext,
} from '../../../shared/source-text/typed/source-types.mts';

type Sides = MovedContext['sides'];
type Side = 'base' | 'head';
type SpanPair = { readonly base: Span; readonly head: Span };

const MAX_TOKEN_EDITS = 1000;
const MAX_HUNK_TOKENS = 50_000;

function linesIn({ start, count }: Span): number[] {
  return Array.from({ length: count }, (_, offset) => start + offset);
}

function hunkTokens(
  lines: readonly (DescribedLine | undefined)[],
  side: Span,
  moved: ReadonlyMap<number, number> | ReadonlySet<number>,
): LineToken[] {
  const tokens: LineToken[] = [];
  for (const line of linesIn(side).filter((candidate) => !moved.has(candidate))) {
    for (const text of lines[line]?.tokens ?? []) {
      tokens.push({ text, line });
    }
  }
  return tokens;
}

function rootOf(parent: Map<string, string>, node: string): string {
  const path = chainFrom(node, (current) => parent.get(current));
  const root = path.at(-1) ?? node;
  for (const visited of path.slice(0, -1)) {
    parent.set(visited, root);
  }
  return root;
}

function join(parent: Map<string, string>, left: string, right: string): void {
  const leftRoot = rootOf(parent, left);
  const rightRoot = rootOf(parent, right);
  if (leftRoot !== rightRoot) {
    parent.set(leftRoot, rightRoot);
  }
}

function unmatchedRoots(
  parent: Map<string, string>,
  tokens: readonly LineToken[],
  { matched, side }: { readonly matched: ReadonlySet<number>; readonly side: string },
): string[] {
  return tokens
    .filter((_, index) => !matched.has(index))
    .map(({ line }) => rootOf(parent, `${side}${String(line)}`));
}

function lineOutcome(
  pairs: readonly (readonly [number, number])[],
  removed: readonly LineToken[],
  added: readonly LineToken[],
): Alignment {
  const parent = new Map<string, string>();
  for (const [removedIndex, addedIndex] of pairs) {
    join(parent, `b${String(removed[removedIndex]?.line)}`, `h${String(added[addedIndex]?.line)}`);
  }
  const dirty = new Set([
    ...unmatchedRoots(parent, removed, {
      matched: new Set(pairs.map(([index]) => index)),
      side: 'b',
    }),
    ...unmatchedRoots(parent, added, {
      matched: new Set(pairs.map(([, index]) => index)),
      side: 'h',
    }),
  ]);
  const changed = new Set(
    added.map(({ line }) => line).filter((line) => dirty.has(rootOf(parent, `h${String(line)}`))),
  );
  const carried = new Map<number, number>();
  for (const [removedIndex, addedIndex] of pairs) {
    const line = added[addedIndex]?.line;
    const removedLine = removed[removedIndex]?.line;
    if (
      line !== undefined &&
      removedLine !== undefined &&
      !(changed.has(line) || carried.has(line))
    ) {
      carried.set(line, removedLine);
    }
  }
  return { changed, carried: [...carried] };
}

function alignHunk(
  hunk: Hunk,
  { sides, moved }: { readonly sides: Sides; readonly moved: ReadonlyMap<number, number> },
): Alignment {
  const removed = hunkTokens(sides.base, hunk.base, new Set(moved.values()));
  const added = hunkTokens(sides.head, hunk.head, moved);
  const pairs =
    removed.length + added.length > MAX_HUNK_TOKENS
      ? undefined
      : alignedPairs(removed, added, MAX_TOKEN_EDITS);
  return pairs === undefined
    ? { changed: new Set(linesIn(hunk.head)), carried: [] }
    : lineOutcome(pairs, removed, added);
}

export function alignHunks(
  hunks: readonly Hunk[],
  filePath: string,
  sources: LineSource['sources'],
): Alignment | undefined {
  const language = languageOfPath(filePath);
  if (language === undefined || sources === undefined || hunks.some((hunk) => !hunk.complete)) {
    return undefined;
  }
  if (sources.base === undefined || sources.head === undefined) {
    return undefined;
  }
  const base = describedLinesOf(sources.base, language);
  const head = describedLinesOf(sources.head, language);
  if (base === undefined || head === undefined) {
    return undefined;
  }
  const sides = { base, head };
  const moved = movedLinesOf({ sides, ...hunkLines(hunks) });
  const outcomes = hunks.map((hunk) => alignHunk(hunk, { sides, moved }));
  return {
    changed: new Set(outcomes.flatMap(({ changed }) => [...changed])),
    carried: [...moved, ...outcomes.flatMap(({ carried }) => carried)].sort(
      ([left], [right]) => left - right,
    ),
  };
}

function hunkLines(hunks: readonly Hunk[]): Omit<MovedContext, 'sides'> {
  const headed = hunksOf({
    hunks: hunks.map(({ base, head }) => [base.start, base.count, head.start, head.count]),
  });
  return {
    inBase: new Set(hunks.flatMap(({ base }) => linesIn(base))),
    inHead: new Set(hunks.flatMap(({ head }) => linesIn(head))),
    anchorOf: (line: number) => line + shiftBefore(headed, line, 'base'),
  };
}

function shiftBefore(hunks: readonly SpanPair[], line: number, side: Side): number {
  const other = side === 'head' ? 'base' : 'head';
  return hunks
    .filter((hunk) => hunk[side].start + Math.max(hunk[side].count, 1) - 1 < line)
    .reduce((shift, hunk) => shift + hunk[other].count - hunk[side].count, 0);
}

function enclosingHunk(hunks: readonly SpanPair[], line: number, side: Side): SpanPair | undefined {
  return hunks.find(
    (hunk) =>
      hunk[side].count > 0 &&
      hunk[side].start <= line &&
      line < hunk[side].start + hunk[side].count,
  );
}

function hunksOf(file: { readonly hunks?: readonly HunkTuple[] }): SpanPair[] {
  return (file.hunks ?? []).map(([baseStart, baseCount, headStart, headCount]) => ({
    base: { start: baseStart, count: baseCount },
    head: { start: headStart, count: headCount },
  }));
}

type MapState = {
  readonly hunks: readonly SpanPair[];
  readonly headToBase: ReadonlyMap<number, number>;
  readonly baseToHead: ReadonlyMap<number, number>;
};

function baseLine({ hunks, headToBase }: MapState, line: number): number | undefined {
  if (headToBase.has(line)) {
    return headToBase.get(line);
  }
  return enclosingHunk(hunks, line, 'head') === undefined
    ? line + shiftBefore(hunks, line, 'head')
    : undefined;
}

function headLine({ hunks, baseToHead }: MapState, line: number): number {
  const carried = baseToHead.get(line);
  if (carried !== undefined) {
    return carried;
  }
  return enclosingHunk(hunks, line, 'base')?.head.start ?? line + shiftBefore(hunks, line, 'base');
}

type LineText = (request: { readonly side: Side } & LinePosition) => string | undefined;

function lineTexts(file: LineSource | undefined): LineText | undefined {
  const sources = file?.sources;
  if (typeof sources?.base !== 'string' || typeof sources.head !== 'string') {
    return undefined;
  }
  const sides = { base: sources.base.split(/\r?\n/u), head: sources.head.split(/\r?\n/u) };
  const normalized = new Map<string, string | undefined>();
  return ({ side, line, column }) => {
    const from = column !== undefined && Number.isInteger(column) && column > 0 ? column - 1 : 0;
    const key = JSON.stringify([side, line, from]);
    if (!normalized.has(key)) {
      const text = sides[side][line - 1]?.slice(from);
      normalized.set(key, text === undefined ? undefined : agnosticTextOf(text, file?.path ?? ''));
    }
    return normalized.get(key);
  };
}

export function lineMapOf(file: LineSource | undefined): LineMap {
  const carried: readonly CarriedLine[] = file?.carried ?? [];
  const map: MapState = {
    hunks: hunksOf(file ?? {}),
    headToBase: new Map(carried),
    baseToHead: new Map(carried.toReversed().map(([head, base]) => [base, head])),
  };
  let texts: LineText | undefined;
  return {
    baseLineOf(line: number) {
      return baseLine(map, line);
    },
    headLineOf(line: number) {
      return headLine(map, line);
    },
    isOutsideHunks(line: number, side: Side = 'head') {
      return enclosingHunk(map.hunks, line, side) === undefined;
    },
    hasSameText(head: LinePosition, base: LinePosition) {
      texts ??= lineTexts(file) ?? (() => undefined);
      const headText = texts({ side: 'head', ...head });
      return headText !== undefined && headText === texts({ side: 'base', ...base });
    },
  };
}
