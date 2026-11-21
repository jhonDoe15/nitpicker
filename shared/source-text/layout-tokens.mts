import { whileHolds } from '../traversal.mts';
import type { LayoutState, PythonLayoutState, Token } from './typed/source-types.mts';

export const NEWLINE = '\u0002n';
export const INDENT = '\u0002i';
export const DEDENT = '\u0002d';

const OPENERS = new Set(['(', '[', '{']);
const CLOSERS = new Set([')', ']', '}']);
export const SEMICOLON: ReadonlySet<string> = new Set([';']);
export const COLON: ReadonlySet<string> = new Set([':']);
const TAB_WIDTH = 8;
const INLINE_BODY_INDENT = 0.5;
const COMPOUND_STATEMENTS = new Set([
  'if',
  'elif',
  'else',
  'for',
  'while',
  'try',
  'except',
  'finally',
  'with',
  'def',
  'class',
  'async',
  'match',
  'case',
]);

export function isOp(token: Token | undefined, texts: ReadonlySet<string>): boolean {
  return token?.kind === 'op' && texts.has(token.text);
}

export function emitNewline(
  state: LayoutState,
  line: number,
  mode: 'plain' | 'inline-body' = 'plain',
): void {
  const last = state.out.at(-1);
  if (last !== undefined && last.text !== NEWLINE) {
    state.out.push({
      kind: 'layout',
      text: NEWLINE,
      line,
      ...(mode === 'inline-body' ? { inlineBody: true as const } : {}),
    });
  }
}

export function flushComments(state: LayoutState): void {
  for (const comment of state.pending.splice(0)) {
    state.out.push(comment);
  }
}

export function startsNewLine(state: LayoutState, token: Token): boolean {
  return state.previous !== undefined && token.line > state.previous.line && token.joined !== true;
}

function indentWidth(lineText = ''): number {
  const state = { width: 0 };
  for (const char of /^[ \t\f]*/u.exec(lineText)?.[0] ?? '') {
    state.width = char === '\f' ? 0 : state.width + 1;
    state.width = char === '\t' ? Math.ceil(state.width / TAB_WIDTH) * TAB_WIDTH : state.width;
  }
  return state.width;
}

function indentTokens(state: PythonLayoutState, line: number): void {
  const width = indentWidth(state.lines[line - 1]);
  const { stack, out } = state;
  for (const levels of whileHolds(
    stack,
    (open: number[]) => open.length > 0 && width < (open.at(-1) ?? Number.NEGATIVE_INFINITY),
  )) {
    levels.pop();
    out.push({ kind: 'layout', text: DEDENT, line });
  }
  const innermost = stack.at(-1) ?? Number.POSITIVE_INFINITY;
  if (stack.length > 0 && width > innermost) {
    out.push({ kind: 'layout', text: INDENT, line });
  }
  if (stack.length === 0 || width > (stack.at(-1) ?? Number.POSITIVE_INFINITY)) {
    stack.push(width);
  }
}

function breakLogicalLine(state: PythonLayoutState, token: Token): void {
  const { previous } = state;
  if (previous === undefined || !startsNewLine(state, token)) {
    return;
  }
  if (state.depth === 0 && !state.continued) {
    emitNewline(state, previous.line);
    state.logicalStart = true;
  }
  state.continued = false;
}

function openInlineBody(state: PythonLayoutState, token: Token): void {
  if (state.colonLine === token.line) {
    emitNewline(state, token.line, 'inline-body');
    state.out.push({ kind: 'layout', text: INDENT, line: token.line });
    state.stack.push((state.stack.at(-1) ?? Number.NaN) + INLINE_BODY_INDENT);
  }
  state.colonLine = undefined;
}

function startLogicalLine(state: PythonLayoutState, token: Token): void {
  if (!state.logicalStart) {
    return;
  }
  state.logicalStart = false;
  indentTokens(state, token.line);
  state.header = token.kind === 'word' && COMPOUND_STATEMENTS.has(token.text);
  state.lambdas = 0;
}

function addPythonToken(state: PythonLayoutState, token: Token): void {
  const atTop = state.depth === 0;
  if (atTop && isOp(token, SEMICOLON)) {
    emitNewline(state, token.line);
    return;
  }
  state.out.push(token);
  state.lambdas += Number(atTop && token.kind === 'word' && token.text === 'lambda');
  if (!(atTop && state.header && isOp(token, COLON))) {
    return;
  }
  if (state.lambdas > 0) {
    state.lambdas -= 1;
    return;
  }
  state.header = false;
  state.colonLine = token.line;
}

function depthAfter(depth: number, token: Token): number {
  if (isOp(token, OPENERS)) {
    return depth + 1;
  }
  return isOp(token, CLOSERS) ? Math.max(depth - 1, 0) : depth;
}

function placePythonToken(state: PythonLayoutState, token: Token): void {
  if (token.kind === 'comment') {
    state.pending.push(token);
    return;
  }
  if (token.kind === 'continuation') {
    state.continued = true;
    return;
  }
  breakLogicalLine(state, token);
  flushComments(state);
  openInlineBody(state, token);
  startLogicalLine(state, token);
  addPythonToken(state, token);
  state.depth = depthAfter(state.depth, token);
  state.previous = token;
}

export function pythonLayout(tokens: readonly Token[], lines: readonly string[]): Token[] {
  const state: PythonLayoutState = {
    out: [],
    pending: [],
    previous: undefined,
    stack: [],
    lines,
    depth: 0,
    logicalStart: true,
    continued: false,
    header: false,
    lambdas: 0,
    colonLine: undefined,
  };
  for (const token of tokens) {
    placePythonToken(state, token);
  }
  if (state.previous !== undefined && state.depth === 0) {
    emitNewline(state, state.previous.line);
  }
  flushComments(state);
  return state.out;
}
