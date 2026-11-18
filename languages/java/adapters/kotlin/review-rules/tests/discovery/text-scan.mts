export { matchesFrom as marksFrom } from '../../../scan/kotlin-brackets.mts';
import { slotOf } from '../typed/indexing.mts';
import type { TextSource, TextTables } from '../typed/discovery-types.mts';
const OPENER_OF: Record<string, string | undefined> = { ')': '(', ']': '[', '}': '{' };
const OPENERS = new Set(['(', '[', '{']);
export const WORD_WINDOW = 128;

function trimTable(code: string): Int32Array {
  const table = new Int32Array(code.length + 1);
  const state = { last: 0, cursor: 0 };
  for (const { index } of code.matchAll(/\S/gu)) {
    table.fill(state.last, state.cursor, index + 1);
    state.last = index + 1;
    state.cursor = index + 1;
  }
  table.fill(state.last, state.cursor);
  return table;
}

function pairTable(code: string): Pick<TextTables, 'openFor' | 'closeFor'> {
  const openFor = new Int32Array(code.length + 1).fill(-1);
  const closeFor = new Int32Array(code.length + 1).fill(code.length);
  const stacks: Record<string, number[]> = { '(': [], '[': [], '{': [] };
  for (const { index, 0: mark } of code.matchAll(/[()[\]{}]/gu)) {
    if (OPENERS.has(mark)) {
      stacks[mark]?.push(index);
    } else {
      const open = stacks[OPENER_OF[mark] ?? '(']?.pop();
      openFor[index] = open ?? -1;
      closeFor[open ?? code.length] = index;
    }
  }
  return { openFor, closeFor };
}

export function textTables(code: string): TextTables {
  return { trim: trimTable(code), ...pairTable(code) };
}

function tablesOf(text: TextSource): TextTables {
  return text.tables ?? textTables(text.code);
}

export function remembered<T>(scanned: TextSource, key: string, build: () => T): T;
export function remembered(scanned: TextSource, key: string, build: () => unknown): unknown {
  const { memo } = scanned;
  if (memo === undefined) {
    return build();
  }
  if (!memo.has(key)) {
    memo.set(key, build());
  }
  return memo.get(key);
}

export function execAt(code: string, pattern: RegExp, at: number): RegExpExecArray | undefined {
  const sticky = new RegExp(pattern.source, 'y');
  sticky.lastIndex = at;
  return sticky.exec(code) ?? undefined;
}

export function skipSpace(code: string, from: number): number {
  return from + (execAt(code, /\s*/u, from)?.[0].length ?? 0);
}

export function nextSignificant(code: string, from: number): string | undefined {
  return code[skipSpace(code, from)];
}

export function trimmedEnd(text: TextSource, end: number): number {
  return slotOf(tablesOf(text).trim, Math.min(end, text.code.length));
}

export function previousSignificant(text: TextSource, before: number): string | undefined {
  return text.code[trimmedEnd(text, before) - 1];
}

export function wordBefore(text: TextSource, end: number): { word: string; start: number } {
  const stop = trimmedEnd(text, end);
  const window = text.code.slice(Math.max(0, stop - WORD_WINDOW), stop);
  const word = /[A-Za-z_]\w*$/u.exec(window)?.[0];
  return word === undefined ? { word: '', start: stop } : { word, start: stop - word.length };
}

export function matchingOpen(text: TextSource, close: number): number {
  return OPENER_OF[text.code[close] ?? ''] === undefined
    ? -1
    : slotOf(tablesOf(text).openFor, close);
}

export function closeOf(text: TextSource, open: number): number {
  return OPENERS.has(text.code[open] ?? '')
    ? slotOf(tablesOf(text).closeFor, open)
    : text.code.length;
}

export function lineStartOf(code: string, index: number): number {
  return index <= 0 ? 0 : code.lastIndexOf('\n', index - 1) + 1;
}

export function lineEndOf(code: string, index: number): number {
  const newline = code.indexOf('\n', index);
  return newline < 0 ? code.length : newline;
}

export function repeatUntil(limit: number, step: () => boolean): void {
  Array.from({ length: limit }).some(() => step());
}

export function escapeRegExp(name: string): string {
  return name.replaceAll(/[$()*+.?[\\\]^{|}]/gu, String.raw`\$&`);
}
