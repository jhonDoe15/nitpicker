const OPENER_OF = { ')': '(', ']': '[', '}': '{' };
const OPENERS = new Set(['(', '[', '{']);
const WORD_WINDOW = 128;

function trimTable(code) {
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

function pairTable(code) {
  const openFor = new Int32Array(code.length + 1).fill(-1);
  const closeFor = new Int32Array(code.length + 1).fill(code.length);
  const stacks = { '(': [], '[': [], '{': [] };
  for (const { index, 0: mark } of code.matchAll(/[()[\]{}]/gu)) {
    if (OPENERS.has(mark)) {
      stacks[mark].push(index);
    } else {
      const open = stacks[OPENER_OF[mark]].pop();
      openFor[index] = open ?? -1;
      closeFor[open ?? code.length] = index;
    }
  }
  return { openFor, closeFor };
}

export function textTables(code) {
  return { trim: trimTable(code), ...pairTable(code) };
}

function tablesOf(text) {
  return text.tables ?? textTables(text.code);
}

export function remembered(scanned, key, build) {
  const { memo } = scanned;
  if (memo === undefined) {
    return build();
  }
  if (!memo.has(key)) {
    memo.set(key, build());
  }
  return memo.get(key);
}

export function marksFrom(code, pattern, from) {
  const marks = new RegExp(pattern.source, 'g');
  marks.lastIndex = from;
  return code.matchAll(marks);
}

export function execAt(code, pattern, at) {
  const sticky = new RegExp(pattern.source, 'y');
  sticky.lastIndex = at;
  return sticky.exec(code);
}

export function skipSpace(code, from) {
  return from + (execAt(code, /\s*/u, from)?.[0].length ?? 0);
}

export function nextSignificant(code, from) {
  return code[skipSpace(code, from)];
}

export function trimmedEnd(text, end) {
  return tablesOf(text).trim[Math.min(end, text.code.length)];
}

export function previousSignificant(text, before) {
  return text.code[trimmedEnd(text, before) - 1];
}

export function wordBefore(text, end) {
  const stop = trimmedEnd(text, end);
  const window = text.code.slice(Math.max(0, stop - WORD_WINDOW), stop);
  const word = /[A-Za-z_]\w*$/u.exec(window)?.[0];
  return word === undefined ? { word: '', start: stop } : { word, start: stop - word.length };
}

export function matchingOpen(text, close) {
  return OPENER_OF[text.code[close]] === undefined ? -1 : tablesOf(text).openFor[close];
}

export function closeOf(text, open) {
  return OPENERS.has(text.code[open]) ? tablesOf(text).closeFor[open] : text.code.length;
}

export function lineStartOf(code, index) {
  return index <= 0 ? 0 : code.lastIndexOf('\n', index - 1) + 1;
}

export function lineEndOf(code, index) {
  const newline = code.indexOf('\n', index);
  return newline < 0 ? code.length : newline;
}

export function repeatUntil(limit, step) {
  Array.from({ length: limit }).some(() => step());
}

export function escaped(name) {
  return name.replaceAll(/[$()*+.?[\\\]^{|}]/gu, String.raw`\$&`);
}
