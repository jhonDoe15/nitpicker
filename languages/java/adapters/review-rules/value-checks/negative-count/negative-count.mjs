import { forward, splitTopLevel } from '../../max-value-sums/source-file.mjs';
import { textOf } from '../../token-calls/calls.mjs';
import { declarations, eachFrame, ownUses } from '../scan.mjs';

const NEGATIVE_COUNT_RULE = 'NegativeCountArgument';

const MEMBER_SINKS = new Set(['repeat', 'take', 'takeLast', 'drop', 'dropLast']);
const CONSTRUCTORS = new Set(['ArrayList', 'List']);
const CLAMPS = new Set(['max', 'coerceAtLeast', 'maxOf', 'coerceIn', 'abs']);
const RELATIONS = new Set(['<', '>', '<=', '>=']);
const LARGEST = /max|largest|longest|lengths/iu;
const OPERAND_ENDS = new Set([')', ']']);

function argumentsOf(source, name, open) {
  const { partner } = source;
  const close = partner[open];
  if (close < 0) {
    return [];
  }
  const parts = splitTopLevel(source, { from: open + 1, to: close });
  if (name === 'copyOf') {
    return parts.slice(1, 2);
  }
  return parts.length === 1 ? parts : [];
}

function sinkOpen(source, index) {
  const { tokens } = source;
  const { text } = tokens[index];
  const after = tokens[index + 1]?.text;
  const member = tokens[index - 1]?.text === '.';
  if (after === '(' && (MEMBER_SINKS.has(text) || text === 'copyOf') && member) {
    return index + 1;
  }
  if (after === '(' && CONSTRUCTORS.has(text) && !member) {
    return index + 1;
  }
  if (text === 'ArrayList' && after === '<') {
    const close = tokens.findIndex((token, at) => at > index && token.text === '>');
    return tokens[close + 1]?.text === '(' ? close + 1 : -1;
  }
  return -1;
}

function subtractionIn(source, { from, to }) {
  const { tokens } = source;
  for (const { index } of forward(source, from)) {
    if (index >= to) {
      return undefined;
    }
    const before = tokens[index - 1];
    const isOperator =
      tokens[index].text === '-' &&
      index > from &&
      (before.kind !== 'operator' || OPERAND_ENDS.has(before.text));
    const rightIsNumber = tokens[index + 1]?.kind === 'number' && index + 2 >= to;
    if (isOperator && !rightIsNumber) {
      return { left: { from, to: index }, right: { from: index + 1, to } };
    }
  }
  return undefined;
}

function clamps(source, range) {
  return source.tokens.slice(range.from, range.to).some(({ text }) => CLAMPS.has(text));
}

function isCounter(source, frameRange, range) {
  const { tokens } = source;
  if (range.to - range.from !== 1 || tokens[range.from].kind !== 'identifier') {
    return false;
  }
  const name = tokens[range.from].text;
  const own = declarations(source, frameRange).filter((each) => each.name === name);
  const zero = own.length === 1 && textOf(source, { from: own[0].at + 2, to: own[0].end }) === '0';
  return (
    zero &&
    ownUses(source, frameRange, name).some((use) => ['++', '+='].includes(tokens[use + 1]?.text))
  );
}

function isComputedLimit(source, frameRange, { left, right }) {
  return LARGEST.test(textOf(source, left)) || isCounter(source, frameRange, right);
}

function windowEnd(tokens, from, limit) {
  const stop = tokens.slice(from, limit).findIndex(({ text }) => ['{', ';'].includes(text));
  return stop === -1 ? limit : from + stop;
}

function guardWindows(source, { frameRange, sinkIndex }) {
  const { tokens } = source;
  const before = tokens.slice(frameRange.from, sinkIndex);
  const lastStop = before.findLastIndex(({ text }) => [';', '{', '}'].includes(text));
  const start = frameRange.from + lastStop + 1;
  const windows = [tokens.slice(start, sinkIndex)];
  for (const [offset, { text }] of before.entries()) {
    if (['if', 'while'].includes(text)) {
      const index = frameRange.from + offset;
      windows.push(tokens.slice(index, windowEnd(tokens, index + 1, sinkIndex)));
    }
  }
  return windows;
}

function hasGuard(source, site, { left, right, variable }) {
  const leftText = textOf(source, left);
  const rightText = textOf(source, right);
  return guardWindows(source, site).some((window) => {
    const text = window.map((token) => token.text).join('');
    const compared = window.some((token) => RELATIONS.has(token.text));
    const named = variable !== undefined && text.includes(variable);
    return compared && ((text.includes(leftText) && text.includes(rightText)) || named);
  });
}

function resolve(source, frameRange, argument) {
  const direct = subtractionIn(source, argument);
  if (direct !== undefined) {
    return { ...direct, variable: undefined };
  }
  const single =
    argument.to - argument.from === 1 && source.tokens[argument.from].kind === 'identifier';
  if (!single) {
    return undefined;
  }
  const name = source.tokens[argument.from].text;
  const own = declarations(source, frameRange).filter((each) => each.name === name);
  if (own.length !== 1) {
    return undefined;
  }
  const found = subtractionIn(source, { from: own[0].at + 2, to: own[0].end });
  return found === undefined ? undefined : { ...found, variable: name };
}

function findAt(source, site, frame) {
  const { frameRange, sinkIndex } = site;
  const name = source.tokens[sinkIndex].text;
  const open = sinkOpen(source, sinkIndex);
  const found = [];
  for (const argument of open === -1 ? [] : argumentsOf(source, name, open)) {
    const subtraction = resolve(source, frameRange, argument);
    const skipped =
      subtraction === undefined ||
      clamps(source, argument) ||
      isComputedLimit(source, frameRange, subtraction);
    if (!(skipped || hasGuard(source, site, subtraction))) {
      const text = textOf(source, { from: subtraction.left.from, to: subtraction.right.to });
      found.push({ line: source.tokens[sinkIndex].line, name, text, method: frame.name });
    }
  }
  return found;
}

function findIn(source, frameRange, frame) {
  return source.tokens
    .slice(frameRange.from, frameRange.to)
    .flatMap((_, offset) =>
      findAt(source, { frameRange, sinkIndex: frameRange.from + offset }, frame),
    );
}

export const NEGATIVE_COUNT_CHECK = {
  rule: NEGATIVE_COUNT_RULE,
  find: (source) => eachFrame(source, (range, frame) => findIn(source, range, frame)),
  message: ({ name, text }, kotlin) =>
    `\`${name}(${text})\` throws ` +
    `${kotlin ? '`IllegalArgumentException`' : '`IllegalArgumentException` or `NegativeArraySizeException`'} ` +
    `when the right side is larger, because the count is negative; ` +
    `${kotlin ? '`coerceAtLeast(0)`' : '`Math.max(0, ...)`'} the count, or check the ` +
    `relation of the two sides first.`,
  allowed:
    'Clamp the count with `Math.max(0, ...)` (Kotlin `coerceAtLeast(0)`), or guard it with a comparison first.',
};
