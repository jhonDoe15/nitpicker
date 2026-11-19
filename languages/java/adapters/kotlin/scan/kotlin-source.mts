import { braceDepths, matchesFrom } from './kotlin-brackets.mts';
import { appendAll } from '../../../../../shared/lists/lists.mts';
import type { Literal, Range, ScanState, Scanned, StackEntry } from './typed/scan-shapes.mts';

export {
  afterGroup,
  braceDepths,
  closingIndex,
  enclosingOpen,
  openBrackets,
  parenDepths,
  splitArguments,
} from './kotlin-brackets.mts';

const CHARACTER_LITERAL = /'(?:\\(?:u[0-9a-fA-F]{4}|.)|[^'\\\n])'/y;
const TOKEN = /"+|\\|'|\/\/|\/\*|\$\{|\$[A-Za-z_`]|[{}\n]/g;
const BLOCK_COMMENT_MARK = /\/\*|\*\//g;
const STRING_MODE = 'string';
const RAW_QUOTES = '"""';
const TOP_LEVEL_MAIN = /(?<![\w.])fun\s+main\s*\(/g;
const ROOT_MARKERS = [
  /@JvmStatic\s+(?:\w+\s+)*fun\s+main\s*\(/,
  /@(?:[\w.]+\.)?SpringBootApplication\b/,
  /(?<![\w.])fun\s+Application\s*\.\s*\w+\s*\(/,
];

function blank(state: ScanState, from: number, to: number): void {
  state.ranges.push({ from, to });
  state.contextRanges.push({ from, to });
}

function blankRanges(source: string, ranges: Range[]): string {
  const pieces: string[] = [];
  let cursor = 0;
  for (const { from, to } of ranges.toSorted((left, right) => left.from - right.from)) {
    const start = Math.max(from, cursor);
    if (to > start) {
      pieces.push(source.slice(cursor, start), source.slice(start, to).replaceAll(/[^\n]/g, ' '));
      cursor = to;
    }
  }
  pieces.push(source.slice(cursor));
  return pieces.join('');
}

function blockCommentEnd(source: string, start: number): number {
  let depth = 0;
  for (const { index, 0: mark } of matchesFrom(source, BLOCK_COMMENT_MARK, start)) {
    depth += mark === '/*' ? 1 : -1;
    if (depth === 0) {
      return index + mark.length;
    }
  }
  return source.length;
}

function lineComment(state: ScanState, index: number): void {
  const { source } = state;
  const newline = source.indexOf('\n', index);
  const end = newline === -1 ? source.length : newline;
  state.comments.push({ start: index, end, kind: 'line', text: source.slice(index + 2, end) });
  blank(state, index, end);
  state.position = end;
}

function blockComment(state: ScanState, index: number): void {
  const { source } = state;
  const end = blockCommentEnd(source, index);
  const kdoc = source.startsWith('/**', index) && !source.startsWith('/**/', index);
  const text = source.slice(index + 2, Math.max(index + 2, end - 2));
  state.comments.push({ start: index, end, kind: kdoc ? 'doc' : 'block', text });
  blank(state, index, end);
  state.position = end;
}

function characterLiteral(state: ScanState, index: number): void {
  const literal = new RegExp(CHARACTER_LITERAL.source, 'y');
  literal.lastIndex = index;
  if (literal.test(state.source)) {
    blank(state, index + 1, literal.lastIndex - 1);
    state.position = literal.lastIndex;
  }
}

function codeEntry(template: boolean, expressionStart: number): StackEntry {
  return {
    mode: 'code',
    start: 0,
    bodyStart: 0,
    template,
    expressions: [],
    depth: 0,
    expressionStart,
  };
}

function topOf(state: ScanState): StackEntry {
  return state.stack.at(-1) ?? codeEntry(false, 0);
}

function openBrace(state: ScanState): void {
  topOf(state).depth += 1;
}

function closeBrace(state: ScanState, index: number): void {
  const top = topOf(state);
  if (top.template && top.depth === 0) {
    state.stack.pop();
    topOf(state).expressions.push({ from: top.expressionStart, to: index });
    return;
  }
  top.depth -= 1;
}

const CODE_TOKENS: Readonly<Record<string, (state: ScanState, index: number) => void>> = {
  '//': lineComment,
  '/*': blockComment,
  "'": characterLiteral,
  '{': openBrace,
  '${': openBrace,
  '}': closeBrace,
};

function closeLiteral(state: ScanState, bodyEnd: number, end: number): void {
  const entry = topOf(state);
  state.stack.pop();
  state.literals.push({
    start: entry.start,
    end,
    bodyStart: entry.bodyStart,
    text: state.source.slice(entry.bodyStart, bodyEnd),
    template: entry.template,
    raw: entry.mode === 'raw',
  });
  state.ranges.push({ from: entry.bodyStart, to: bodyEnd });
  const edges = [
    entry.bodyStart,
    ...entry.expressions.flatMap(({ from, to }) => [from, to]),
    bodyEnd,
  ];
  for (const [position, from] of edges.entries()) {
    if (position % 2 === 0) {
      state.contextRanges.push({ from, to: edges[position + 1] ?? from });
    }
  }
}

function openLiteral(state: ScanState, start: number, mode: 'raw' | typeof STRING_MODE): number {
  const width = mode === 'raw' ? RAW_QUOTES.length : 1;
  state.stack.push({
    mode,
    start,
    bodyStart: start + width,
    template: false,
    expressions: [],
    depth: 0,
    expressionStart: 0,
  });
  return start + width;
}

function quoteStep(state: ScanState, from: number, end: number): number[] {
  if (from >= end) {
    return [];
  }
  const { mode } = topOf(state);
  if (mode === 'raw') {
    if (end - from >= RAW_QUOTES.length) {
      closeLiteral(state, end - RAW_QUOTES.length, end);
    }
    return [];
  }
  if (mode === STRING_MODE) {
    closeLiteral(state, from, from + 1);
    return [from + 1];
  }
  const raw = end - from >= RAW_QUOTES.length;
  return [openLiteral(state, from, raw ? 'raw' : STRING_MODE)];
}

function readQuotes(state: ScanState, start: number, end: number): void {
  const pending = [start];
  for (const from of pending) {
    appendAll(pending, quoteStep(state, from, end));
  }
}

function readLiteralToken(state: ScanState, index: number, text: string): void {
  const top = topOf(state);
  if (top.mode === STRING_MODE && text === '\\') {
    state.position = index + 2;
  } else if (top.mode === STRING_MODE && text === '\n') {
    closeLiteral(state, index, index + 1);
  } else if (text === '${') {
    top.template = true;
    state.stack.push(codeEntry(true, index + 2));
  } else if (text.startsWith('$')) {
    top.template = true;
  }
}

function readToken(state: ScanState, { index = 0, 0: text }: RegExpMatchArray): void {
  const end = index + text.length;
  if (text.startsWith('"') && end > state.position) {
    readQuotes(state, Math.max(index, state.position), end);
    return;
  }
  if (index < state.position) {
    return;
  }
  if (topOf(state).mode === 'code') {
    CODE_TOKENS[text]?.(state, index);
    return;
  }
  readLiteralToken(state, index, text);
}

function closeOpenLiterals(state: ScanState): void {
  const { length } = state.source;
  for (const entry of state.stack.slice(1).toReversed()) {
    if (entry.mode === 'code') {
      state.stack.pop();
    } else {
      closeLiteral(state, length, length);
    }
  }
}

function lineStarts(source: string): number[] {
  return [0, ...[...source.matchAll(/\n/g)].map(({ index }) => index + 1)];
}

export function scanKotlinSource(source: string): Scanned {
  const state: ScanState = {
    source,
    ranges: [],
    contextRanges: [],
    literals: [],
    comments: [],
    stack: [codeEntry(false, 0)],
    position: 0,
  };
  for (const token of source.matchAll(TOKEN)) {
    readToken(state, token);
  }
  closeOpenLiterals(state);
  return {
    source,
    code: blankRanges(source, state.ranges),
    contextCode: blankRanges(source, state.contextRanges),
    literals: state.literals.toSorted((left, right) => left.start - right.start),
    comments: state.comments,
    lineStarts: lineStarts(source),
  };
}

export function lineOf(scanned: Scanned, offset: number): number {
  return scanned.lineStarts.findLastIndex((start) => start <= offset) + 1;
}

export function lineText(scanned: Scanned, line: number): string {
  const start = scanned.lineStarts[line - 1];
  const next = scanned.lineStarts[line];
  return scanned.source.slice(start, next === undefined ? undefined : next - 1);
}

export function literalAt(scanned: Scanned, offset: number): Literal | undefined {
  return scanned.literals.find(({ start }) => start === offset);
}

export function literalsIn(scanned: Scanned, from: number, to: number): Literal[] {
  return scanned.literals.filter(({ start, end }) => start >= from && end <= to);
}

export function lineAt(code: string, start: number): string {
  const end = code.indexOf('\n', start);
  return code.slice(start, end === -1 ? undefined : end);
}

export function lineStart(code: string, offset: number): number {
  return code.lastIndexOf('\n', offset - 1) + 1;
}

export function inImport(code: string, offset: number): boolean {
  const start = lineStart(code, offset);
  return /^[ \t]*import\s/.test(code.slice(start, offset + 1));
}

export function isCompositionRoot(scanned: Scanned): boolean {
  const depths = braceDepths(scanned.code);
  const declaresMain = [...scanned.code.matchAll(TOP_LEVEL_MAIN)].some(
    ({ index }) => depths[index] === 0,
  );
  return declaresMain || ROOT_MARKERS.some((marker) => marker.test(scanned.code));
}
