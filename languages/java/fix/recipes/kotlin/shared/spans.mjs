function lineStartOf(text, offset) {
  return text.lastIndexOf('\n', offset - 1) + 1;
}

export function indicesDown(from) {
  return Array.from({ length: from + 1 }, (_, offset) => from - offset);
}

function lineEndOf(text, offset) {
  const newline = text.indexOf('\n', offset);
  return newline === -1 ? text.length : newline;
}

export function removalSpan(text, start, end) {
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
