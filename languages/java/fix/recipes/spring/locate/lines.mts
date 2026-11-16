import type { Line, LineTable, Range } from './locate-types.mts';

const LINE_BREAK = /\r\n|\r|\n/g;
const BOM = '﻿';

export function lineTable(text: string): Line[] {
  const lines: Line[] = [];
  let start = text.startsWith(BOM) ? 1 : 0;
  for (const match of text.matchAll(LINE_BREAK)) {
    lines.push({
      start,
      end: match.index,
      next: match.index + match[0].length,
      text: text.slice(start, match.index),
    });
    start = match.index + match[0].length;
  }
  lines.push({ start, end: text.length, next: text.length, text: text.slice(start) });
  return lines;
}

export function lineAt(table: LineTable, index: number): Line {
  const line = table[index];
  if (line === undefined) {
    throw new RangeError(`no line at index ${String(index)}`);
  }
  return line;
}

export function removalRange(table: LineTable, first: number, last: number = first): Range {
  const from = lineAt(table, first);
  const to = lineAt(table, last);
  if (to.next === to.end && first > 0) {
    return { start: lineAt(table, first - 1).end, end: to.end };
  }
  return { start: from.start, end: to.next };
}
