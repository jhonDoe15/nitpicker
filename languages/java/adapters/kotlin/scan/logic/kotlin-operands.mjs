import { closingIndex } from '../kotlin-source.mjs';

const OPENERS = new Set(['(', '[', '{']);
const LOOSE_OPERATOR =
  /[,;]|&&|\|\||[=!]==?|<=?|>=?|\?:|\.\.|[+\-*/%]|(?<![\w.])(?:is|in|as|to|until|downTo|step|and|or|xor|shl|shr)\b/;
const EQUALITY = /[=!]==?|(?<![\w.])!?(?:is|in)\b/g;
const FLIPPED = new Map([
  ['==', '!='],
  ['!=', '=='],
  ['===', '!=='],
  ['!==', '==='],
  ['is', '!is'],
  ['!is', 'is'],
  ['in', '!in'],
  ['!in', 'in'],
]);

/** A piece of a file: `code` with strings and comments blanked for reading, `text` to print. */
export function view(scanned, start, end) {
  return { code: scanned.code.slice(start, end), text: scanned.printable.slice(start, end) };
}

function cut({ code, text }, start, end) {
  return { code: code.slice(start, end), text: text.slice(start, end) };
}

export function trimmed(piece) {
  const start = piece.code.length - piece.code.trimStart().length;
  return cut(piece, start, piece.code.trimEnd().length);
}

function topLevel(code) {
  const pieces = [];
  let cursor = 0;
  for (const { index } of code.matchAll(/[([{]/g)) {
    if (index >= cursor && OPENERS.has(code[index])) {
      const close = closingIndex(code, index);
      pieces.push(code.slice(cursor, index + 1), '_'.repeat(Math.max(0, close - index - 1)));
      cursor = close;
    }
  }
  pieces.push(code.slice(cursor));
  return pieces.join('');
}

/** False when folding the piece onto one line could change it: a raw string or a block across lines. */
export function foldable(piece) {
  const { code, text } = trimmed(piece);
  return !code.includes('\n') || (!text.includes('"""') && !code.includes('{'));
}

/** The piece without one pair of parentheses around all of it. */
export function bare(piece) {
  const whole = trimmed(piece);
  const grouped =
    whole.code.startsWith('(') && closingIndex(whole.code, 0) === whole.code.length - 1;
  return grouped ? trimmed(cut(whole, 1, whole.code.length - 1)) : whole;
}

export function printed(piece) {
  return trimmed(piece)
    .text.replaceAll(/\s*\n\s*/g, '\n')
    .replaceAll(/([([])\n/g, '$1')
    .replaceAll(/,?\n([)\]])/g, '$1')
    .replaceAll('\n', ' ');
}

function isTight(piece) {
  const top = topLevel(trimmed(piece).code);
  return (
    top !== '' && !LOOSE_OPERATOR.test(top) && !/\s/.test(top.replaceAll(/\s*(\?\.|\.)\s*/g, '$1'))
  );
}

/** The operand of a single prefix `!` (`!ready` is `ready`), or undefined. */
export function negatedOperand(piece) {
  const whole = trimmed(piece);
  const { code } = whole;
  if (!code.startsWith('!') || code.startsWith('!!') || code.startsWith('!=')) {
    return undefined;
  }
  const operand = trimmed(cut(whole, 1, code.length));
  return isTight(operand) ? operand : undefined;
}

/** `a == b` as `a != b` (also `===`, `is`, `in`), when that is the only operator at the top level. */
export function flippedComparison(piece) {
  const whole = trimmed(piece);
  const top = topLevel(whole.code);
  const operators = [...top.matchAll(EQUALITY)];
  if (operators.length !== 1 || /&&|\|\||[<>]/.test(top.replaceAll(EQUALITY, ' '))) {
    return undefined;
  }
  const [{ index, 0: operator }] = operators;
  const left = printed(cut(whole, 0, index));
  const right = printed(cut(whole, index + operator.length, whole.code.length));
  return `${left} ${FLIPPED.get(operator)} ${right}`;
}

/** The `&&` or `||` that joins the top level, when only one of them does. */
export function chainOperator(piece) {
  const top = topLevel(piece.code);
  const and = top.includes('&&');
  const or = top.includes('||');
  if (and === or) {
    return undefined;
  }
  return and ? '&&' : '||';
}

export function chainParts(piece, operator) {
  const top = topLevel(piece.code);
  const pieces = [];
  let start = 0;
  for (const { index } of top.matchAll(operator === '&&' ? /&&/g : /\|\|/g)) {
    pieces.push(cut(piece, start, index));
    start = index + 2;
  }
  pieces.push(cut(piece, start, piece.code.length));
  return pieces;
}

/** The negation of a condition in its shortest exact form. */
export function negated(piece) {
  const operand = negatedOperand(piece);
  if (operand !== undefined) {
    return printed(bare(operand));
  }
  if (isTight(piece)) {
    return `!${printed(piece)}`;
  }
  return flippedComparison(piece) ?? `!(${printed(piece)})`;
}
