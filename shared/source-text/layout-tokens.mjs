export const NEWLINE = '\u0002n';
export const INDENT = '\u0002i';
export const DEDENT = '\u0002d';

const OPENERS = new Set(['(', '[', '{']);
const CLOSERS = new Set([')', ']', '}']);
const SEMICOLON = new Set([';']);
const COLON = new Set([':']);
const STEPS = new Set(['++', '--']);
const STATEMENT_OPENERS = new Set([';', '{']);
const CLOSING_BRACE = new Set(['}']);
const PARENTHESES = new Set(['(', '[']);
const CLOSING_PARENTHESES = new Set([')', ']']);
const TAB_WIDTH = 8;
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

function isOp(token, texts) {
  return token?.kind === 'op' && texts.has(token.text);
}

function emitNewline(state, line, inlineBody = false) {
  const last = state.out.at(-1);
  if (last !== undefined && last.text !== NEWLINE) {
    state.out.push({ kind: 'layout', text: NEWLINE, line, inlineBody });
  }
}

function flushComments(state) {
  state.out.push(...state.pending.splice(0));
}

function startsNewLine(state, token) {
  return state.previous !== undefined && token.line > state.previous.line && token.joined !== true;
}

function indentWidth(lineText = '') {
  const state = { width: 0 };
  for (const char of /^[ \t\f]*/u.exec(lineText)[0]) {
    state.width = char === '\f' ? 0 : state.width + 1;
    state.width = char === '\t' ? Math.ceil(state.width / TAB_WIDTH) * TAB_WIDTH : state.width;
  }
  return state.width;
}

function indentTokens(state, line) {
  const width = indentWidth(state.lines[line - 1]);
  const { stack, out } = state;
  while (stack.length > 0 && width < stack.at(-1)) {
    stack.pop();
    out.push({ kind: 'layout', text: DEDENT, line });
  }
  if (stack.length > 0 && width > stack.at(-1)) {
    out.push({ kind: 'layout', text: INDENT, line });
  }
  if (stack.length === 0 || width > stack.at(-1)) {
    stack.push(width);
  }
}

function breakLogicalLine(state, token) {
  if (!startsNewLine(state, token)) {
    return;
  }
  if (state.depth === 0 && !state.continued) {
    emitNewline(state, state.previous.line);
    state.logicalStart = true;
  }
  state.continued = false;
}

function openInlineBody(state, token) {
  if (state.colonLine === token.line) {
    emitNewline(state, token.line, true);
    state.out.push({ kind: 'layout', text: INDENT, line: token.line });
    state.stack.push(state.stack.at(-1) + 0.5);
  }
  state.colonLine = undefined;
}

function startLogicalLine(state, token) {
  if (!state.logicalStart) {
    return;
  }
  state.logicalStart = false;
  indentTokens(state, token.line);
  state.header = token.kind === 'word' && COMPOUND_STATEMENTS.has(token.text);
  state.lambdas = 0;
}

function addPythonToken(state, token) {
  const atTop = state.depth === 0;
  if (atTop && isOp(token, SEMICOLON)) {
    emitNewline(state, token.line);
    return;
  }
  state.out.push(token);
  state.lambdas += Number(atTop && token.kind === 'word' && token.text === 'lambda');
  if (!atTop || !state.header || !isOp(token, COLON)) {
    return;
  }
  if (state.lambdas > 0) {
    state.lambdas -= 1;
    return;
  }
  state.header = false;
  state.colonLine = token.line;
}

function depthAfter(depth, token) {
  if (isOp(token, OPENERS)) {
    return depth + 1;
  }
  return isOp(token, CLOSERS) ? Math.max(depth - 1, 0) : depth;
}

function placePythonToken(state, token) {
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

export function pythonLayout(tokens, lines) {
  const state = { out: [], pending: [], stack: [], lines, depth: 0, logicalStart: true };
  for (const token of tokens) {
    placePythonToken(state, token);
  }
  if (state.previous !== undefined && state.depth === 0) {
    emitNewline(state, state.previous.line);
  }
  flushComments(state);
  return state.out;
}

function isExpressionEnd(token, rules) {
  if (token.kind === 'word') {
    return !rules.statementWords.has(token.text) && !rules.restricted.has(token.text);
  }
  if (token.kind === 'op') {
    return rules.operandEnds.has(token.text) && token.headerClose !== true;
  }
  return token.kind !== 'continuation';
}

function continues(token, rules) {
  if (token.template === true) {
    return rules.taggedTemplates;
  }
  return (token.kind === 'op' || token.kind === 'word') && rules.continuation.has(token.text);
}

function endsStatement(previous, next, rules) {
  if (previous.kind === 'word' && rules.restricted.has(previous.text)) {
    return true;
  }
  if (!isExpressionEnd(previous, rules)) {
    return false;
  }
  if (next === undefined || isOp(next, STEPS)) {
    return true;
  }
  return !continues(next, rules);
}

function isEmptyStatementBody(previous, rules) {
  return (
    previous?.headerClose === true ||
    (previous?.kind === 'word' && rules.emptyBodies.has(previous.text)) ||
    isOp(previous, COLON)
  );
}

function addSemicolon(state, token) {
  const { previous } = state;
  if (state.parens.length > 0 || isEmptyStatementBody(previous, state.rules)) {
    state.out.push(token);
    return;
  }
  if (previous !== undefined && !isOp(previous, STATEMENT_OPENERS)) {
    emitNewline(state, token.line);
  }
}

function dropNewlineBeforeBrace(state) {
  const index = state.out.findLastIndex((token) => token.kind !== 'comment');
  if (index !== -1 && state.out[index].text === NEWLINE) {
    state.out.splice(index, 1);
  }
}

function addStatementToken(state, token) {
  if (isOp(token, SEMICOLON)) {
    addSemicolon(state, token);
    return;
  }
  if (isOp(token, CLOSING_BRACE)) {
    dropNewlineBeforeBrace(state);
  }
  state.out.push(token);
}

function tracked(state, token) {
  if (isOp(token, PARENTHESES)) {
    const { previous, rules } = state;
    state.parens.push(
      token.text === '(' && previous?.kind === 'word' && rules.headers.has(previous.text),
    );
    return token;
  }
  if (!isOp(token, CLOSING_PARENTHESES) || state.parens.length === 0) {
    return token;
  }
  return state.parens.pop() ? { ...token, headerClose: true } : token;
}

function placeStatementToken(state, token) {
  if (token.kind === 'comment') {
    state.pending.push(token);
    return;
  }
  const { previous, rules } = state;
  if (
    state.parens.length === 0 &&
    startsNewLine(state, token) &&
    endsStatement(previous, token, rules)
  ) {
    emitNewline(state, previous.line);
  }
  flushComments(state);
  addStatementToken(state, token);
  state.previous = tracked(state, token);
}

export function statementLayout(tokens, rules) {
  const state = { out: [], pending: [], parens: [], rules };
  for (const token of tokens) {
    placeStatementToken(state, token);
  }
  const { previous } = state;
  if (
    previous !== undefined &&
    state.parens.length === 0 &&
    endsStatement(previous, undefined, rules)
  ) {
    emitNewline(state, previous.line);
  }
  flushComments(state);
  return state.out;
}
