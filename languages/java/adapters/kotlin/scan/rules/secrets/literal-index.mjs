const INDEXES = new WeakMap();
const NESTING = /[()[\]{}"]/g;
const OPENERS = '([{';

function firstStartsFrom(scanned) {
  const first = new Int32Array(scanned.code.length + 2);
  let cursor = 0;
  for (const [index, literal] of scanned.literals.entries()) {
    first.fill(index, cursor, literal.start + 1);
    cursor = Math.max(cursor, literal.start + 1);
  }
  first.fill(scanned.literals.length, cursor);
  return first;
}

function nest(stack, mark, index) {
  if (OPENERS.includes(mark)) {
    stack.push(index);
  } else {
    stack.pop();
  }
}

function enclosingOpens(scanned, byStart) {
  const opens = new Map();
  const stack = [];
  let skipUntil = 0;
  for (const { index, 0: mark } of scanned.code.matchAll(NESTING)) {
    const literal = mark === '"' ? byStart.get(index) : undefined;
    if (index < skipUntil || (mark === '"' && literal === undefined)) {
      continue;
    }
    if (literal === undefined) {
      nest(stack, mark, index);
    } else {
      opens.set(index, stack.at(-1) ?? -1);
      skipUntil = literal.end;
    }
  }
  return opens;
}

function buildIndex(scanned) {
  const byStart = new Map(scanned.literals.map((literal) => [literal.start, literal]));
  return {
    byStart,
    byEnd: new Map(scanned.literals.map((literal) => [literal.end, literal])),
    first: firstStartsFrom(scanned),
    opens: enclosingOpens(scanned, byStart),
  };
}

export function literalIndex(scanned) {
  if (!INDEXES.has(scanned)) {
    INDEXES.set(scanned, buildIndex(scanned));
  }
  return INDEXES.get(scanned);
}

export function literalsWithin(scanned, { start, end }) {
  const { first } = literalIndex(scanned);
  const from = first[Math.min(start, first.length - 1)];
  const to = first[Math.min(end, first.length - 1)];
  return scanned.literals.slice(from, to).filter((literal) => literal.end <= end);
}
