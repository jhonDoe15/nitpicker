const LINE_BREAK = /\r\n|\r|\n/g;
const BOM = '﻿';

export function lineTable(text) {
  const lines = [];
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

export function removalRange(table, first, last = first) {
  const from = table[first];
  const to = table[last];
  if (to.next === to.end && first > 0) {
    return { start: table[first - 1].end, end: to.end };
  }
  return { start: from.start, end: to.next };
}
