import { largest, smallest } from '../../../lists/lists.mts';
import type { LengthRange } from '../fact-types.mts';

type Range = readonly [number, number];
type Frame = {
  readonly branches: [number, number][];
  pending: Range | undefined;
  readonly lookaround: boolean;
};

const NONE: Range = [0, 0];
const ONE: Range = [1, 1];
const UNBOUNDED = Number.POSITIVE_INFINITY;
const SYMBOLS: Readonly<Record<string, Range>> = {
  '*': [0, UNBOUNDED],
  '+': [1, UNBOUNDED],
  '?': [0, 1],
};
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

function product(left: number, right: number): number {
  return left === 0 || right === 0 ? 0 : left * right;
}

function quantifierRange(token: string): Range {
  const braces = BRACES.exec(token);
  if (braces === null) {
    return SYMBOLS[token[0] ?? ''] ?? ONE;
  }
  const min = Number(braces[1]);
  if (braces[2] === undefined) {
    return [min, min];
  }
  return [min, braces[3] === '' ? UNBOUNDED : Number(braces[3])];
}

function newFrame(lookaround = false): Frame {
  return { branches: [[0, 0]], pending: undefined, lookaround };
}

function flush(frame: Frame): void {
  const branch = frame.branches.at(-1);
  if (branch !== undefined) {
    branch[0] += frame.pending?.[0] ?? 0;
    branch[1] += frame.pending?.[1] ?? 0;
  }
  frame.pending = undefined;
}

function rangeOf(frame: Frame): Range {
  flush(frame);
  const mins = frame.branches.map(([min]) => min);
  const maxes = frame.branches.map(([, max]) => max);
  return [smallest(mins), largest(maxes)];
}

function attach(stack: Frame[], closed: Frame): void {
  const range = rangeOf(closed);
  const parent = stack.at(-1);
  if (parent !== undefined) {
    parent.pending = closed.lookaround ? NONE : range;
  }
}

function closeAll(stack: Frame[]): void {
  for (const closed of stack.slice(1).reverse()) {
    stack.pop();
    attach(stack, closed);
  }
}

function applyQuantifier(frame: Frame, token: string): void {
  const [min, max] = quantifierRange(token);
  frame.pending = frame.pending && [product(frame.pending[0], min), product(frame.pending[1], max)];
}

function applyStructure(token: string, frame: Frame, stack: Frame[]): void {
  if (token === ')' && stack.length > 1) {
    const closed = stack.pop();
    if (closed !== undefined) {
      attach(stack, closed);
    }
  } else if (token === '|') {
    frame.branches.push([0, 0]);
  } else if (token.startsWith('(')) {
    stack.push(newFrame(LOOKAROUND.test(token)));
  } else if (token !== ')') {
    frame.pending = ZERO_WIDTH.test(token) ? NONE : ONE;
  }
}

function handleToken(token: string, stack: Frame[]): void {
  const frame = stack.at(-1);
  if (frame === undefined) {
    return;
  }
  if (QUANTIFIER.test(token)) {
    applyQuantifier(frame, token);
    return;
  }
  flush(frame);
  applyStructure(token, frame, stack);
}

export function patternLength(
  source: string,
  { implicitAnchors }: { implicitAnchors: boolean } = { implicitAnchors: false },
): LengthRange | undefined {
  const text = implicitAnchors ? `^${source}$` : source;
  if (!(START.test(text) && END.test(text))) {
    return undefined;
  }
  const root = newFrame();
  const stack = [root];
  for (const [token] of text.matchAll(TOKEN)) {
    handleToken(token, stack);
  }
  closeAll(stack);
  const [min, max] = rangeOf(root);
  return { min, max };
}
