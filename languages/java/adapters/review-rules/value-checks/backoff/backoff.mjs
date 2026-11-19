import { eachFrame } from '../scan.mjs';

const BACKOFF_RULE = 'BackoffShiftOverflow';

const SHIFTS = new Set(['<<', 'shl']);
const ONES = new Set(['1', '1L', '1l']);
const HINT = /attempt|retr(?:y|ies)|tries|backoff|delay|wait|sleep|failure/iu;
const RELATIONS = new Set(['<', '>', '<=', '>=']);
const SAFE_BOUND = 30;
const MIN_ARGUMENTS_OFFSET = 3;

function exponentOf(source, from) {
  const { tokens, partner } = source;
  const first = tokens[from];
  if (
    first?.text === 'Math' &&
    tokens[from + 1]?.text === '.' &&
    tokens[from + 2]?.text === 'min'
  ) {
    const open = from + MIN_ARGUMENTS_OFFSET;
    const close = partner[open];
    const inner = tokens.slice(open + 1, close).map(({ text }) => text);
    const comma = inner.indexOf(',');
    const limit = Number(
      inner
        .slice(comma + 1)
        .join('')
        .replace(/[lL]$/u, ''),
    );
    return { text: inner.slice(0, comma).join(''), bound: limit };
  }
  if (first?.kind === 'identifier' && !['.', '(', '['].includes(tokens[from + 1]?.text ?? '')) {
    return { text: first.text, bound: undefined };
  }
  return undefined;
}

function isMultiplied(source, shiftIndex) {
  const { tokens, opener, partner } = source;
  const open = opener[shiftIndex];
  if (open < 0 || tokens[open].text !== '(') {
    return false;
  }
  const before = tokens[open - 1]?.text;
  const after = tokens[partner[open] + 1]?.text;
  return before === '*' || after === '*';
}

function isCompared(source, range, name) {
  const { tokens } = source;
  return tokens.slice(range.from, range.to).some(({ text }, offset) => {
    const index = range.from + offset;
    return (
      text === name &&
      (RELATIONS.has(tokens[index + 1]?.text) || RELATIONS.has(tokens[index - 1]?.text))
    );
  });
}

function isUnbounded(source, range, exponent) {
  const bounded =
    exponent.bound === undefined
      ? isCompared(source, range, exponent.text)
      : exponent.bound <= SAFE_BOUND;
  return !bounded;
}

function exponentAt(source, index) {
  const shifted =
    SHIFTS.has(source.tokens[index].text) &&
    ONES.has(source.tokens[index - 1].text) &&
    isMultiplied(source, index);
  return shifted ? exponentOf(source, index + 1) : undefined;
}

function findIn(source, range, frame) {
  const { tokens } = source;
  const start = range.from + 1;
  const found = [];
  for (const [offset, { line }] of tokens.slice(start, range.to).entries()) {
    const exponent = exponentAt(source, start + offset);
    const named = exponent !== undefined && (HINT.test(exponent.text) || HINT.test(frame.name));
    if (named && isUnbounded(source, range, exponent)) {
      found.push({ line, name: exponent.text, method: frame.name });
    }
  }
  return found;
}

export const BACKOFF_CHECK = {
  rule: BACKOFF_RULE,
  find: (source) => eachFrame(source, (range, frame) => findIn(source, range, frame)),
  message: ({ name }, kotlin) =>
    `The delay is multiplied by \`1 ${kotlin ? 'shl' : '<<'} ${name}\`, but nothing ` +
    `keeps \`${name}\` below about 30, so for a large attempt count the product ` +
    `overflows and the delay turns negative or small; cap the exponent, or use ` +
    `\`Math.multiplyExact\` and fall back to the maximum delay.`,
  allowed:
    'Cap the exponent (`Math.min(attempt, 20)`), compare the attempt with a limit ' +
    'first, or use `Math.multiplyExact` and fall back to the maximum delay.',
};
