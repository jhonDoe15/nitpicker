const KEY = /^(\s*)((?:\\.|[^\\=:\s])*)(\s*[=:]?\s*)/;

function continues(text) {
  return /(?<!\\)(?:\\\\)*\\$/.test(text.trimStart());
}

function lastLineOf(table, first) {
  const ends = table.slice(first).findIndex(({ text }) => !continues(text));
  return ends < 0 ? table.length - 1 : first + ends;
}

export function propertyAt(table, lineNumber, entry) {
  const first = table[lineNumber - 1];
  const found = first === undefined ? undefined : KEY.exec(first.text);
  if (found === undefined || found[2] !== entry.key) {
    return undefined;
  }
  const last = lastLineOf(table, lineNumber - 1);
  const keyStart = first.start + found[1].length;
  const valueStart = first.start + found[0].length;
  const valueEnd = Math.max(valueStart, table[last].start + table[last].text.trimEnd().length);
  return {
    first: lineNumber - 1,
    last,
    key: { start: keyStart, end: keyStart + found[2].length },
    value: { start: valueStart, end: valueEnd, quote: '' },
  };
}
