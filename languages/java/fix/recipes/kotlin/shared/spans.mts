import type { Span } from './kotlin-scan.mts';

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

export function removalSpan(text: string, start: number, end: number): Span {
  const lineStart = lineStartOf(text, start);
  const lineEnd = lineEndOf(text, end);
  const before = text.slice(lineStart, start);
  const after = text.slice(end, lineEnd);
  if (before.trim() === '' && after.trim() === '') {
    return { start: lineStart, end: Math.min(lineEnd + 1, text.length) };
  }
  if (after.trim() === '') {
    return { start: start - (before.length - before.trimEnd().length), end };
  }
  return { start, end: end + (after.length - after.trimStart().length) };
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
