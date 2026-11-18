import type { TSESLint } from '@typescript-eslint/utils';

type SourceCode = TSESLint.SourceCode;

export type Range = { readonly start: number; readonly end: number };

function lineStart(text: string, offset: number): number {
  return text.lastIndexOf('\n', offset - 1) + 1;
}

function lineEnd(text: string, offset: number): number {
  const newline = text.indexOf('\n', offset);
  return newline === -1 ? text.length : newline + 1;
}

export function withOwnLines(text: string, { start, end }: Range): Range {
  const first = lineStart(text, start);
  const last = lineEnd(text, end);
  const alone = text.slice(first, start).trim() === '' && text.slice(end, last).trim() === '';
  return alone ? { start: first, end: last } : { start, end };
}

export function hasComment(sourceCode: SourceCode, { start, end }: Range): boolean {
  return sourceCode
    .getAllComments()
    .some(({ range }) => range !== undefined && range[0] < end && range[1] > start);
}
