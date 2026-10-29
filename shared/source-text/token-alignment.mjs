function startOfStep(frontier, diagonal, edits) {
  const fromAbove =
    diagonal === -edits ||
    (diagonal !== edits && frontier.get(diagonal - 1) < frontier.get(diagonal + 1));
  return fromAbove
    ? { previous: diagonal + 1, x: frontier.get(diagonal + 1) }
    : { previous: diagonal - 1, x: frontier.get(diagonal - 1) + 1 };
}

function* offsetsBelow(limit) {
  for (const [offset] of Array.prototype.entries.call({ length: limit })) {
    yield offset;
  }
}

function followDiagonal(left, right, start) {
  const room = Math.min(left.length - start.x, right.length - start.y);
  for (const offset of offsetsBelow(room)) {
    if (left[start.x + offset] !== right[start.y + offset]) {
      return { x: start.x + offset, y: start.y + offset };
    }
  }
  return { x: start.x + room, y: start.y + room };
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
    const diagonal = Math.max(Math.min(cursor.x - previousX, cursor.y - previousY), 0);
    pairs.push(
      ...Array.from({ length: diagonal }, (_, offset) => [
        cursor.x - 1 - offset,
        cursor.y - 1 - offset,
      ]),
    );
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

function gapPairs(sides, from, to) {
  const left = sides.left.slice(from[0], to[0]).map(({ text }) => text);
  const right = sides.right.slice(from[1], to[1]).map(({ text }) => text);
  return (alignTokens(left, right, sides.maxEdits) ?? []).map(([leftIndex, rightIndex]) => [
    from[0] + leftIndex,
    from[1] + rightIndex,
  ]);
}

function boundaries(lines, index, total) {
  return { start: lines[index]?.start ?? total, end: lines[index]?.end ?? total };
}

function pairedLine(bounds) {
  return Array.from({ length: bounds.left.end - bounds.left.start }, (_, offset) => [
    bounds.left.start + offset,
    bounds.right.start + offset,
  ]);
}

export function alignLines(left, right, maxEdits) {
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
    pairs.push(...gapPairs(sides, previous, [bounds.left.start, bounds.right.start]));
    pairs.push(...pairedLine(bounds));
    previous.splice(0, 2, bounds.left.end, bounds.right.end);
  }
  return pairs;
}
