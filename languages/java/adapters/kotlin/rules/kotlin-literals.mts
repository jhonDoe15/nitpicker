type Frame =
  | { mode: 'code'; template: boolean; depth: number }
  | { mode: 'block'; depth: number }
  | { mode: 'string'; start: number };
type Mask = { source: string; code: string; literals: string[]; stack: Frame[] };
type Reader = (state: Mask, index: number) => number;

const RAW_QUOTES = 3;
const STRING_MODE = 'string';
const MARK = '\u0001';
const CHARACTER_LITERAL = /'(?:\\(?:u[0-9a-fA-F]{4}|.)|[^'\\\n])'/y;
const EVERY_CHARACTER = /[^]/g;

function startsWith(state: Mask, index: number, text: string): boolean {
  return state.source.startsWith(text, index);
}

function insideTemplate(state: Mask): boolean {
  return state.stack.some((frame) => frame.mode === 'code' && frame.template);
}

function emit(state: Mask, text: string): void {
  if (!insideTemplate(state)) {
    state.code += text;
  }
}

function openMode(state: Mask, entry: Frame): void {
  state.stack.push(entry);
}

function closeString(state: Mask, start: number, end: number): void {
  state.stack.pop();
  if (!insideTemplate(state)) {
    state.literals.push(state.source.slice(start, end));
    state.code += `"${MARK}${String(state.literals.length - 1)}${MARK}"`;
  }
}

function openRawString(state: Mask, index: number): number {
  const start = index + RAW_QUOTES;
  const closing = state.source.indexOf('"""', start);
  const end = closing === -1 ? state.source.length : closing;
  openMode(state, { mode: STRING_MODE, start });
  closeString(state, start, end);
  const quotes = /^"*/.exec(state.source.slice(end + RAW_QUOTES))?.[0] ?? '';
  return end + RAW_QUOTES + quotes.length;
}

function openString(state: Mask, index: number): number {
  openMode(state, { mode: STRING_MODE, start: index + 1 });
  return index + 1;
}

function openBlockComment(state: Mask, index: number): number {
  openMode(state, { mode: 'block', depth: 1 });
  emit(state, ' ');
  return index + 2;
}

function skipLineComment(state: Mask, index: number): number {
  const end = state.source.indexOf('\n', index);
  emit(state, ' ');
  return end === -1 ? state.source.length : end;
}

function readCharacter(state: Mask, index: number): number {
  CHARACTER_LITERAL.lastIndex = index;
  const matched = CHARACTER_LITERAL.test(state.source);
  emit(state, matched ? "''" : "'");
  return matched ? CHARACTER_LITERAL.lastIndex : index + 1;
}

function openBrace(state: Mask, index: number): number {
  const top = state.stack.at(-1);
  if (top?.mode === 'code') {
    top.depth += 1;
  }
  emit(state, '{');
  return index + 1;
}

function closeBrace(state: Mask, index: number): number {
  const top = state.stack.at(-1);
  if (top?.mode !== 'code') {
    return index + 1;
  }
  if (top.template && top.depth === 0) {
    state.stack.pop();
  } else {
    top.depth -= 1;
    emit(state, '}');
  }
  return index + 1;
}

const CODE_TOKENS: readonly (readonly [string, Reader])[] = [
  ['/*', openBlockComment],
  ['//', skipLineComment],
  ['"""', openRawString],
  ['"', openString],
  ["'", readCharacter],
  ['{', openBrace],
  ['}', closeBrace],
];

function readCode(state: Mask, index: number): number {
  const token = CODE_TOKENS.find(([text]) => startsWith(state, index, text));
  if (token === undefined) {
    emit(state, state.source[index] ?? '');
    return index + 1;
  }
  return token[1](state, index);
}

function readBlockComment(state: Mask, index: number): number {
  const top = state.stack.at(-1);
  if (top?.mode !== 'block') {
    return index + 1;
  }
  if (startsWith(state, index, '/*')) {
    top.depth += 1;
    return index + 2;
  }
  if (startsWith(state, index, '*/')) {
    top.depth -= 1;
    if (top.depth === 0) {
      state.stack.pop();
    }
    return index + 2;
  }
  return index + 1;
}

function readStringBody(state: Mask, index: number): number {
  const top = state.stack.at(-1);
  if (top?.mode !== STRING_MODE) {
    return index + 1;
  }
  const { start } = top;
  if (startsWith(state, index, '\\')) {
    return index + 2;
  }
  if (startsWith(state, index, '"') || startsWith(state, index, '\n')) {
    closeString(state, start, index);
    return index + 1;
  }
  if (startsWith(state, index, '${')) {
    openMode(state, { mode: 'code', template: true, depth: 0 });
    return index + 2;
  }
  return index + 1;
}

const READERS: Readonly<Record<Frame['mode'], Reader>> = {
  code: readCode,
  block: readBlockComment,
  string: readStringBody,
};

export function maskKotlinSource(source: string): { code: string; literals: string[] } {
  const state: Mask = {
    source,
    code: '',
    literals: [],
    stack: [{ mode: 'code', template: false, depth: 0 }],
  };
  let next = 0;
  for (const { index } of source.matchAll(EVERY_CHARACTER)) {
    if (index >= next) {
      next = READERS[state.stack.at(-1)?.mode ?? 'code'](state, index);
    }
  }
  return { code: state.code, literals: state.literals };
}

export const LITERAL_MARK = new RegExp(`"${MARK}(\\d+)${MARK}"`, 'g');
