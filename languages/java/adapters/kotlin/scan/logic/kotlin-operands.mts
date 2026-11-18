import { closingIndex } from '../kotlin-source.mts';
import type { Scanned } from '../typed/scan-shapes.mts';

export type PrintScan = Scanned & { printable: string };
export type Piece = { code: string; text: string };

const OPENERS = new Set(['(', '[', '{']);
const LOOSE_OPERATOR =
  /[,;]|&&|\|\||[=!]==?|<=?|>=?|\?:|\.\.|[+\-*/%]|(?<![\w.])(?:is|in|as|to|until|downTo|step|and|or|xor|shl|shr)\b/;
const EQUALITY = /[=!]==?|(?<![\w.])!?(?:is|in)\b/g;
const FLIPPED = new Map<string, string>([
  ['==', '!='],
  ['!=', '=='],
  ['===', '!=='],
  ['!==', '==='],
  ['is', '!is'],
  ['!is', 'is'],
  ['in', '!in'],
  ['!in', 'in'],
]);

export function view(scanned: PrintScan, start: number, end: number): Piece {
  return { code: scanned.code.slice(start, end), text: scanned.printable.slice(start, end) };
}

function cut({ code, text }: Piece, start: number, end: number): Piece {
  return { code: code.slice(start, end), text: text.slice(start, end) };
}

export function trimmed(piece: Piece): Piece {
  const start = piece.code.length - piece.code.trimStart().length;
  return cut(piece, start, piece.code.trimEnd().length);
}

function topLevel(code: string): string {
  const pieces: string[] = [];
  let cursor = 0;
  for (const { index } of code.matchAll(/[([{]/g)) {
    if (index >= cursor && OPENERS.has(code[index] ?? '')) {
      const close = closingIndex(code, index);
      pieces.push(code.slice(cursor, index + 1), '_'.repeat(Math.max(0, close - index - 1)));
      cursor = close;
    }
  }
  pieces.push(code.slice(cursor));
  return pieces.join('');
}

export function foldable(piece: Piece): boolean {
  const { code, text } = trimmed(piece);
  return !(code.includes('\n') && (text.includes('"""') || code.includes('{')));
}

export function bare(piece: Piece): Piece {
  const whole = trimmed(piece);
  const grouped =
    whole.code.startsWith('(') && closingIndex(whole.code, 0) === whole.code.length - 1;
  return grouped ? trimmed(cut(whole, 1, whole.code.length - 1)) : whole;
}

export function printed(piece: Piece): string {
  return trimmed(piece)
    .text.replaceAll(/\s*\n\s*/g, '\n')
    .replaceAll(/([([])\n/g, '$1')
    .replaceAll(/,?\n([)\]])/g, '$1')
    .replaceAll('\n', ' ');
}

function isTight(piece: Piece): boolean {
  const top = topLevel(trimmed(piece).code);
  return (
    top !== '' && !LOOSE_OPERATOR.test(top) && !/\s/.test(top.replaceAll(/\s*(\?\.|\.)\s*/g, '$1'))
  );
}

export function negatedOperand(piece: Piece): Piece | undefined {
  const whole = trimmed(piece);
  const { code } = whole;
  if (!code.startsWith('!') || code.startsWith('!!') || code.startsWith('!=')) {
    return undefined;
  }
  const operand = trimmed(cut(whole, 1, code.length));
  return isTight(operand) ? operand : undefined;
}

export function flippedComparison(piece: Piece): string | undefined {
  const whole = trimmed(piece);
  const top = topLevel(whole.code);
  const operators = [...top.matchAll(EQUALITY)];
  if (operators.length !== 1 || /&&|\|\||[<>]/.test(top.replaceAll(EQUALITY, ' '))) {
    return undefined;
  }
  const [first] = operators;
  if (first === undefined) {
    return undefined;
  }
  const { index, 0: operator } = first;
  const left = printed(cut(whole, 0, index));
  const right = printed(cut(whole, index + operator.length, whole.code.length));
  return `${left} ${FLIPPED.get(operator) ?? ''} ${right}`;
}

export function chainOperator(piece: Piece): '&&' | '||' | undefined {
  const top = topLevel(piece.code);
  const and = top.includes('&&');
  const or = top.includes('||');
  if (and === or) {
    return undefined;
  }
  return and ? '&&' : '||';
}

export function chainParts(piece: Piece, operator: string): Piece[] {
  const top = topLevel(piece.code);
  const pieces: Piece[] = [];
  let start = 0;
  for (const { index } of top.matchAll(operator === '&&' ? /&&/g : /\|\|/g)) {
    pieces.push(cut(piece, start, index));
    start = index + 2;
  }
  pieces.push(cut(piece, start, piece.code.length));
  return pieces;
}

export function negated(piece: Piece): string {
  const operand = negatedOperand(piece);
  if (operand !== undefined) {
    return printed(bare(operand));
  }
  if (isTight(piece)) {
    return `!${printed(piece)}`;
  }
  return flippedComparison(piece) ?? `!(${printed(piece)})`;
}
