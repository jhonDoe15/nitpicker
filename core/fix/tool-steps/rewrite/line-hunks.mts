type Hunk = {
  readonly aStart: number;
  readonly aEnd: number;
  readonly bStart: number;
  readonly bEnd: number;
};
type Described = {
  readonly hunk: Hunk;
  readonly pure: boolean;
  readonly removed: ReadonlySet<string>;
  readonly added: ReadonlySet<string>;
};
type Lines = readonly string[];

const LINE_END = /(?<=\n)/u;
const MAX_CELLS = 4_000_000;

export function linesOf(text: string): string[] {
  return text === '' ? [] : text.split(LINE_END);
}

function range(start: number, end: number): number[] {
  return Array.from({ length: Math.max(0, end - start) }, (_, offset) => start + offset);
}

function sharedEnds(a: Lines, b: Lines): { prefix: number; suffix: number } {
  const shorter = Math.min(a.length, b.length);
  const prefix = range(0, shorter).find((index) => a[index] !== b[index]) ?? shorter;
  const rest = shorter - prefix;
  const suffix =
    range(0, rest).find((offset) => a[a.length - 1 - offset] !== b[b.length - 1 - offset]) ?? rest;
  return { prefix, suffix };
}

function cellOf(table: Int32Array, index: number): number {
  return table[index] ?? 0;
}

function suffixTable(a: Lines, b: Lines): { table: Int32Array; width: number } {
  const width = b.length + 1;
  const table = new Int32Array((a.length + 1) * width);
  for (const i of range(0, a.length).reverse()) {
    for (const j of range(0, b.length).reverse()) {
      table[i * width + j] =
        a[i] === b[j]
          ? cellOf(table, (i + 1) * width + j + 1) + 1
          : Math.max(cellOf(table, (i + 1) * width + j), cellOf(table, i * width + j + 1));
    }
  }
  return { table, width };
}

function matchedPairs(a: Lines, b: Lines): [number, number][] {
  if (a.length * b.length > MAX_CELLS) {
    return [];
  }
  const { table, width } = suffixTable(a, b);
  const pairs: [number, number][] = [];
  let j = 0;
  for (const i of range(0, a.length)) {
    j =
      range(j, b.length).find(
        (k) =>
          a[i] === b[k] || cellOf(table, (i + 1) * width + k) >= cellOf(table, i * width + k + 1),
      ) ?? b.length;
    if (j < b.length && a[i] === b[j]) {
      pairs.push([i, j]);
      j += 1;
    }
  }
  return pairs;
}

function lineByLine(hunk: Hunk): Hunk[] {
  const length = hunk.aEnd - hunk.aStart;
  return length > 1 && length === hunk.bEnd - hunk.bStart
    ? range(0, length).map((offset) => ({
        aStart: hunk.aStart + offset,
        aEnd: hunk.aStart + offset + 1,
        bStart: hunk.bStart + offset,
        bEnd: hunk.bStart + offset + 1,
      }))
    : [hunk];
}

export function lineHunks(a: Lines, b: Lines): Hunk[] {
  const { prefix, suffix } = sharedEnds(a, b);
  const middle = matchedPairs(
    a.slice(prefix, a.length - suffix),
    b.slice(prefix, b.length - suffix),
  );
  const anchors: [number, number][] = [
    [prefix - 1, prefix - 1],
    ...middle.map(([i, j]): [number, number] => [i + prefix, j + prefix]),
    [a.length - suffix, b.length - suffix],
  ];
  return anchors
    .slice(1)
    .map(([aEnd, bEnd], index) => {
      const [aBefore, bBefore] = anchors[index] ?? [0, 0];
      return { aStart: aBefore + 1, aEnd, bStart: bBefore + 1, bEnd };
    })
    .filter(({ aStart, aEnd, bStart, bEnd }) => aStart < aEnd || bStart < bEnd)
    .flatMap(lineByLine);
}

function touchedLines(base: string, live: string): Set<number> {
  return new Set(
    lineHunks(linesOf(base), linesOf(live)).flatMap(({ bStart, bEnd }) => range(bStart, bEnd)),
  );
}

function touches(hunk: Hunk, touched: ReadonlySet<number>): boolean {
  return hunk.aStart === hunk.aEnd
    ? touched.has(hunk.aStart - 1) || touched.has(hunk.aStart)
    : range(hunk.aStart, hunk.aEnd).some((line) => touched.has(line));
}

function contentOf(lines: Lines, start: number, end: number): Set<string> {
  return new Set(lines.slice(start, end).filter((line) => line.trim() !== ''));
}

function described(hunk: Hunk, liveLines: Lines, formattedLines: Lines): Described {
  return {
    hunk,
    pure: hunk.aStart === hunk.aEnd || hunk.bStart === hunk.bEnd,
    removed: contentOf(liveLines, hunk.aStart, hunk.aEnd),
    added: contentOf(formattedLines, hunk.bStart, hunk.bEnd),
  };
}

function moves(left: Described, right: Described): boolean {
  return (
    left !== right &&
    (left.pure || right.pure) &&
    ([...left.removed].some((line) => right.added.has(line)) ||
      [...right.removed].some((line) => left.added.has(line)))
  );
}

function movedInto(kept: Set<Described>, entry: Described, other: Described): void {
  if (moves(entry, other)) {
    kept.add(other);
  }
}

function withMovedLines(
  entries: readonly Described[],
  touching: readonly Described[],
): Described[] {
  const kept = new Set(touching);
  for (const entry of kept) {
    for (const other of entries.filter((candidate) => !kept.has(candidate))) {
      movedInto(kept, entry, other);
    }
  }
  return [...kept];
}

export function touchedLinesFormatted({
  base,
  live,
  formatted,
}: {
  readonly base: string;
  readonly live: string;
  readonly formatted: string;
}): string {
  const liveLines = linesOf(live);
  const formattedLines = linesOf(formatted);
  const touched = touchedLines(base, live);
  const entries = lineHunks(liveLines, formattedLines).map((hunk) =>
    described(hunk, liveLines, formattedLines),
  );
  const chosen = withMovedLines(
    entries,
    entries.filter(({ hunk }) => touches(hunk, touched)),
  );
  const kept = entries.filter((entry) => chosen.includes(entry)).map(({ hunk }) => hunk);
  const pieces: string[] = [];
  let next = 0;
  for (const hunk of kept) {
    for (const line of [
      ...liveLines.slice(next, hunk.aStart),
      ...formattedLines.slice(hunk.bStart, hunk.bEnd),
    ]) {
      pieces.push(line);
    }
    next = hunk.aEnd;
  }
  return [...pieces, ...liveLines.slice(next)].join('');
}
