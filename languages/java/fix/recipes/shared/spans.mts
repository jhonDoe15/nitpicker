import type { Span } from '../../../adapters/near-duplicates/extract-types.mts';

function lineStartOf(text: string, offset: number): number {
  return text.lastIndexOf('\n', offset - 1) + 1;
}

export function indicesDown(from: number): number[] {
  return Array.from({ length: from + 1 }, (_, offset) => from - offset);
}

function lineEndOf(text: string, offset: number): number {
  const newline = text.indexOf('\n', offset);
  return newline === -1 ? text.length : newline;
}

const TOKEN_CHARACTER = /[\w$]/u;
const OPERATOR_CHARACTERS = '+-&|<>*/=!';

function needsSeparator(before: string, after: string): boolean {
  const left = before.at(-1) ?? '';
  const right = after.trimStart()[0] ?? '';
  return (
    (TOKEN_CHARACTER.test(left) && TOKEN_CHARACTER.test(right)) ||
    (left === right && OPERATOR_CHARACTERS.includes(left))
  );
}

export function removalSpan(text: string, start: number, end: number): Span & { text: string } {
  const lineStart = lineStartOf(text, start);
  const lineEnd = lineEndOf(text, end);
  const before = text.slice(lineStart, start);
  const after = text.slice(end, lineEnd);
  if (before.trim() === '' && after.trim() === '') {
    return { start: lineStart, end: Math.min(lineEnd + 1, text.length), text: '' };
  }
  if (after.trim() === '') {
    return { start: start - (before.length - before.trimEnd().length), end, text: '' };
  }
  const joined = needsSeparator(before, after);
  return {
    start,
    end: end + (after.length - after.trimStart().length),
    text: joined ? ' ' : '',
  };
}

export function statementPrefix(text: string, index: number): string {
  const before = text.slice(0, index);
  const boundary = Math.max(
    before.lastIndexOf(';'),
    before.lastIndexOf('{'),
    before.lastIndexOf('}'),
  );
  return before.slice(boundary + 1);
}
