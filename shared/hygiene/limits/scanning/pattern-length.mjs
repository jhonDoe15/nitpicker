const NONE = [0, 0];
const ONE = [1, 1];
const UNBOUNDED = Number.POSITIVE_INFINITY;
const SYMBOLS = { '*': [0, UNBOUNDED], '+': [1, UNBOUNDED], '?': [0, 1] };
const BRACES = /^\{(\d+)(,(\d*))?\}/u;
const OPEN_SOURCE = String.raw`\((?:\?(?::|=|!|<=|<!|<\w+>|P<\w+>))?`;
const QUANTIFIER_SOURCE = String.raw`(?:[*+?]|\{\d+(?:,\d*)?\})[?+]?`;
const CLASS_SOURCE = String.raw`\[\^?\]?(?:\\[\s\S]|[^\]\\])*\]`;
const TOKEN_SOURCES = [
  QUANTIFIER_SOURCE,
  OPEN_SOURCE,
  String.raw`\)`,
  String.raw`\|`,
  CLASS_SOURCE,
  String.raw`\\[\s\S]`,
  String.raw`[\s\S]`,
];
const TOKEN = new RegExp(TOKEN_SOURCES.join('|'), 'gu');
const QUANTIFIER = new RegExp(`^${QUANTIFIER_SOURCE}$`, 'u');
const LOOKAROUND = /^\(\?(?:=|!|<=|<!)/u;
const ZERO_WIDTH = /^(?:[$^]|\\[bBAzZ])$/u;
const START = /^(?:\^|\\A)/u;
const END = /(?:[^\\]|^)\$$|\\[zZ]$/u;

function product(left, right) {
  return left === 0 || right === 0 ? 0 : left * right;
}

function quantifierRange(token) {
  const braces = BRACES.exec(token);
  if (braces === null) {
    return SYMBOLS[token[0]];
  }
  const min = Number(braces[1]);
  if (braces[2] === undefined) {
    return [min, min];
  }
  return [min, braces[3] === '' ? UNBOUNDED : Number(braces[3])];
}

function newFrame(lookaround = false) {
  return { branches: [[0, 0]], pending: undefined, lookaround };
}

function flush(frame) {
  const branch = frame.branches.at(-1);
  branch[0] += frame.pending?.[0] ?? 0;
  branch[1] += frame.pending?.[1] ?? 0;
  frame.pending = undefined;
}

function rangeOf(frame) {
  flush(frame);
  const mins = frame.branches.map(([min]) => min);
  const maxes = frame.branches.map(([, max]) => max);
  return [Math.min(...mins), Math.max(...maxes)];
}

function attach(stack, closed) {
  const range = rangeOf(closed);
  stack.at(-1).pending = closed.lookaround ? NONE : range;
}

function closeAll(stack) {
  for (const closed of stack.slice(1).reverse()) {
    stack.pop();
    attach(stack, closed);
  }
}

function handleToken(token, stack) {
  const frame = stack.at(-1);
  if (QUANTIFIER.test(token)) {
    const [min, max] = quantifierRange(token);
    frame.pending = frame.pending && [
      product(frame.pending[0], min),
      product(frame.pending[1], max),
    ];
    return;
  }
  flush(frame);
  if (token === ')' && stack.length > 1) {
    attach(stack, stack.pop());
  } else if (token === '|') {
    frame.branches.push([0, 0]);
  } else if (token.startsWith('(')) {
    stack.push(newFrame(LOOKAROUND.test(token)));
  } else if (token !== ')') {
    frame.pending = ZERO_WIDTH.test(token) ? NONE : ONE;
  }
}

export function patternLength(source, { implicitAnchors = false } = {}) {
  const text = implicitAnchors ? `^${source}$` : source;
  if (!(START.test(text) && END.test(text))) {
    return undefined;
  }
  const stack = [newFrame()];
  for (const [token] of text.matchAll(TOKEN)) {
    handleToken(token, stack);
  }
  closeAll(stack);
  const [min, max] = rangeOf(stack[0]);
  return { min, max };
}
