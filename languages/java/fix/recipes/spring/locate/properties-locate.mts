import { lineAt } from './lines.mts';
import type { Located, LineTable } from './locate-types.mts';

const KEY = /^(\s*)((?:\\.|[^\\=:\s])*)(\s*[=:]?\s*)/;

function continues(text: string): boolean {
  return /(?<!\\)(?:\\\\)*\\$/.test(text.trimStart());
}

function lastLineOf(table: LineTable, first: number): number {
  const ends = table.slice(first).findIndex(({ text }) => !continues(text));
  return ends < 0 ? table.length - 1 : first + ends;
}

export function propertyAt(
  table: LineTable,
  lineNumber: number,
  entry: { readonly key: string },
): Located | undefined {
  const first = table[lineNumber - 1];
  if (first === undefined) {
    return undefined;
  }
  const found = KEY.exec(first.text) ?? undefined;
  if (found?.[2] !== entry.key) {
    return undefined;
  }
  const last = lastLineOf(table, lineNumber - 1);
  const keyStart = first.start + (found[1] ?? '').length;
  const valueStart = first.start + found[0].length;
  const lastLine = lineAt(table, last);
  const valueEnd = Math.max(valueStart, lastLine.start + lastLine.text.trimEnd().length);
  return {
    first: lineNumber - 1,
    last,
    key: { start: keyStart, end: keyStart + entry.key.length },
    value: { start: valueStart, end: valueEnd, quote: '' },
  };
}
