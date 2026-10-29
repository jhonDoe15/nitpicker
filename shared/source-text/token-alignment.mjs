import { whileHolds } from '../traversal.mjs';

function startOfStep(frontier, diagonal, edits) {
  const fromAbove =
    diagonal === -edits ||
    (diagonal !== edits && frontier.get(diagonal - 1) < frontier.get(diagonal + 1));
  return fromAbove
    ? { previous: diagonal + 1, x: frontier.get(diagonal + 1) }
    : { previous: diagonal - 1, x: frontier.get(diagonal - 1) + 1 };
}

function followDiagonal(left, right, start) {
  const end = { x: start.x, y: start.y };
  for (const current of whileHolds(
    end,
    ({ x, y }) => x < left.length && y < right.length && left[x] === right[y],
  )) {
    current.x += 1;
    current.y += 1;
  }
  return end;
}

function diagonalsOf(edits) {
  return Array.from({ length: edits + 1 }, (_, index) => 2 * index - edits);
}

function step(frontier, edits, sides) {
  for (const diagonal of diagonalsOf(edits)) {
    const { x } = startOfStep(frontier, diagonal, edits);
    const end = followDiagonal(sides.left, sides.right, { x, y: x - diagonal });
    frontier.set(diagonal, end.x);
    if (end.x >= sides.left.length && end.y >= sides.right.length) {
      return true;
    }
  }
  return false;
}

function backtrack(trace, sides) {
  const pairs = [];
  const cursor = { x: sides.left.length, y: sides.right.length };
  for (const [edits, frontier] of [...trace.entries()].reverse()) {
    const { previous } = startOfStep(frontier, cursor.x - cursor.y, edits);
    const previousX = edits === 0 ? 0 : frontier.get(previous);
    const previousY = edits === 0 ? 0 : previousX - previous;
    for (const current of whileHolds(cursor, ({ x, y }) => x > previousX && y > previousY)) {
      current.x -= 1;
      current.y -= 1;
      pairs.push([current.x, current.y]);
    }
    Object.assign(cursor, { x: previousX, y: previousY });
  }
  return pairs.reverse();
}

export function alignTokens(left, right, maxEdits) {
  const sides = { left, right };
  const frontier = new Map([[1, 0]]);
  const trace = [];
  const limit = Math.min(left.length + right.length, maxEdits);
  for (const edits of Array.from({ length: limit + 1 }, (_, index) => index)) {
    trace.push(new Map(frontier));
    if (step(frontier, edits, sides)) {
      return backtrack(trace, sides);
    }
  }
  return undefined;
}

function linesOf(tokens) {
  const lines = [];
  for (const [index, token] of tokens.entries()) {
    const last = lines.at(-1);
    if (last?.line === token.line) {
      last.end = index + 1;
    } else {
      lines.push({ line: token.line, start: index, end: index + 1 });
    }
  }
  return lines;
}

function lineKeys(tokens, lines) {
  return lines.map(({ start, end }) =>
    tokens
      .slice(start, end)
      .map(({ text }) => text)
      .join('\0'),
  );
}

function appendShifted(pairs, shifted, offset) {
  for (const [leftIndex, rightIndex] of shifted) {
    pairs.push([offset[0] + leftIndex, offset[1] + rightIndex]);
  }
}

function texts(tokens) {
  return tokens.map(({ text }) => text);
}

function gapPairs(sides, from, to) {
  const left = texts(sides.left.slice(from[0], to[0]));
  const right = texts(sides.right.slice(from[1], to[1]));
  return alignTokens(left, right, sides.maxEdits) ?? [];
}

function boundaries(lines, index, total) {
  return { start: lines[index]?.start ?? total, end: lines[index]?.end ?? total };
}

function alignLines(left, right, maxEdits) {
  const sides = { left, right, maxEdits };
  const leftLines = linesOf(left);
  const rightLines = linesOf(right);
  const linePairs = alignTokens(lineKeys(left, leftLines), lineKeys(right, rightLines), maxEdits);
  if (linePairs === undefined) {
    return undefined;
  }
  const pairs = [];
  const previous = [0, 0];
  for (const [leftLine, rightLine] of [...linePairs, [leftLines.length, rightLines.length]]) {
    const bounds = {
      left: boundaries(leftLines, leftLine, left.length),
      right: boundaries(rightLines, rightLine, right.length),
    };
    appendShifted(
      pairs,
      gapPairs(sides, previous, [bounds.left.start, bounds.right.start]),
      previous,
    );
    for (const offset of Array.from({ length: bounds.left.end - bounds.left.start }).keys()) {
      pairs.push([bounds.left.start + offset, bounds.right.start + offset]);
    }
    previous.splice(0, 2, bounds.left.end, bounds.right.end);
  }
  return pairs;
}

function commonEnds(left, right) {
  const shorter = Math.min(left.length, right.length);
  const ends = { prefix: 0, suffix: 0 };
  for (const current of whileHolds(
    ends,
    ({ prefix }) => prefix < shorter && left[prefix].text === right[prefix].text,
  )) {
    current.prefix += 1;
  }
  const room = shorter - ends.prefix;
  for (const current of whileHolds(
    ends,
    ({ suffix }) => suffix < room && left.at(-1 - suffix).text === right.at(-1 - suffix).text,
  )) {
    current.suffix += 1;
  }
  return ends;
}

export function alignSequences(left, right, maxEdits) {
  const { prefix, suffix } = commonEnds(left, right);
  const middle = {
    left: left.slice(prefix, left.length - suffix),
    right: right.slice(prefix, right.length - suffix),
  };
  const inner =
    alignTokens(texts(middle.left), texts(middle.right), maxEdits) ??
    alignLines(middle.left, middle.right, maxEdits);
  if (inner === undefined) {
    return undefined;
  }
  const pairs = Array.from({ length: prefix }, (_, index) => [index, index]);
  appendShifted(pairs, inner, [prefix, prefix]);
  for (const offset of Array.from({ length: suffix }).keys()) {
    pairs.push([left.length - suffix + offset, right.length - suffix + offset]);
  }
  return pairs;
}
