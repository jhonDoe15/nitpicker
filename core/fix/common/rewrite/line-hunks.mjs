const LINE_END = /(?<=\n)/u;
const MAX_CELLS = 4_000_000;

export function linesOf(text) {
  return text === '' ? [] : text.split(LINE_END);
}

function range(start, end) {
  return Array.from({ length: Math.max(0, end - start) }, (_, offset) => start + offset);
}

function sharedEnds(a, b) {
  const shorter = Math.min(a.length, b.length);
  const prefix = range(0, shorter).find((index) => a[index] !== b[index]) ?? shorter;
  const rest = shorter - prefix;
  const suffix =
    range(0, rest).find((offset) => a[a.length - 1 - offset] !== b[b.length - 1 - offset]) ?? rest;
  return { prefix, suffix };
}

function suffixTable(a, b) {
  const width = b.length + 1;
  const table = new Int32Array((a.length + 1) * width);
  for (const i of range(0, a.length).reverse()) {
    for (const j of range(0, b.length).reverse()) {
      table[i * width + j] =
        a[i] === b[j]
          ? table[(i + 1) * width + j + 1] + 1
          : Math.max(table[(i + 1) * width + j], table[i * width + j + 1]);
    }
  }
  return { table, width };
}

function matchedPairs(a, b) {
  if (a.length * b.length > MAX_CELLS) {
    return [];
  }
  const { table, width } = suffixTable(a, b);
  const pairs = [];
  let j = 0;
  for (const i of range(0, a.length)) {
    j =
      range(j, b.length).find(
        (k) => a[i] === b[k] || table[(i + 1) * width + k] >= table[i * width + k + 1],
      ) ?? b.length;
    if (j < b.length && a[i] === b[j]) {
      pairs.push([i, j]);
      j += 1;
    }
  }
  return pairs;
}

function lineByLine(hunk) {
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

export function lineHunks(a, b) {
  const { prefix, suffix } = sharedEnds(a, b);
  const middle = matchedPairs(
    a.slice(prefix, a.length - suffix),
    b.slice(prefix, b.length - suffix),
  );
  const anchors = [
    [prefix - 1, prefix - 1],
    ...middle.map(([i, j]) => [i + prefix, j + prefix]),
    [a.length - suffix, b.length - suffix],
  ];
  return anchors
    .slice(1)
    .map(([aEnd, bEnd], index) => ({
      aStart: anchors[index][0] + 1,
      aEnd,
      bStart: anchors[index][1] + 1,
      bEnd,
    }))
    .filter(({ aStart, aEnd, bStart, bEnd }) => aStart < aEnd || bStart < bEnd)
    .flatMap(lineByLine);
}

function touchedLines(base, live) {
  return new Set(
    lineHunks(linesOf(base), linesOf(live)).flatMap(({ bStart, bEnd }) => range(bStart, bEnd)),
  );
}

function touches(hunk, touched) {
  return hunk.aStart === hunk.aEnd
    ? touched.has(hunk.aStart - 1) || touched.has(hunk.aStart)
    : range(hunk.aStart, hunk.aEnd).some((line) => touched.has(line));
}

function contentOf(lines, start, end) {
  return new Set(lines.slice(start, end).filter((line) => line.trim() !== ''));
}

function described(hunk, liveLines, formattedLines) {
  return {
    hunk,
    pure: hunk.aStart === hunk.aEnd || hunk.bStart === hunk.bEnd,
    removed: contentOf(liveLines, hunk.aStart, hunk.aEnd),
    added: contentOf(formattedLines, hunk.bStart, hunk.bEnd),
  };
}

function moves(left, right) {
  return (
    left !== right &&
    (left.pure || right.pure) &&
    ([...left.removed].some((line) => right.added.has(line)) ||
      [...right.removed].some((line) => left.added.has(line)))
  );
}

function withMovedLines(entries, touching) {
  const kept = [...touching];
  for (const entry of kept) {
    kept.push(...entries.filter((other) => !kept.includes(other) && moves(entry, other)));
  }
  return kept;
}

export function touchedLinesFormatted({ base, live, formatted }) {
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
  const pieces = [];
  let next = 0;
  for (const hunk of kept) {
    pieces.push(
      ...liveLines.slice(next, hunk.aStart),
      ...formattedLines.slice(hunk.bStart, hunk.bEnd),
    );
    next = hunk.aEnd;
  }
  return [...pieces, ...liveLines.slice(next)].join('');
}
