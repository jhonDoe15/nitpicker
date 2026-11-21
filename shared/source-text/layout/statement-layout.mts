import {
  COLON,
  emitNewline,
  flushComments,
  isOp,
  NEWLINE,
  SEMICOLON,
  startsNewLine,
} from '../layout-tokens.mts';
import type { StatementLayoutState, StatementRules, Token } from '../typed/source-types.mts';

const STEPS = new Set(['++', '--']);
const STATEMENT_OPENERS = new Set([';', '{']);
const CLOSING_BRACE = new Set(['}']);
const OPENING_BRACE = new Set(['{']);
const PARENTHESES = new Set(['(', '[']);
const CLOSING_PARENTHESES = new Set([')', ']']);

function isExpressionEnd(token: Token, rules: StatementRules): boolean {
  switch (token.kind) {
    case 'word':
      return !(rules.statementWords.has(token.text) || rules.restricted.has(token.text));
    case 'op':
      return rules.operandEnds.has(token.text) && token.headerClose !== true;
    case 'continuation':
      return false;
    case 'string':
    case 'piece':
    case 'number':
    case 'regex':
    case 'comment':
    case 'layout':
      return true;
  }
}

function carriesText({ kind }: Token): boolean {
  switch (kind) {
    case 'op':
    case 'word':
      return true;
    case 'string':
    case 'piece':
    case 'number':
    case 'regex':
    case 'comment':
    case 'continuation':
    case 'layout':
      return false;
  }
}

function continues(token: Token, rules: StatementRules): boolean {
  if (token.template === true) {
    return rules.taggedTemplates;
  }
  return carriesText(token) && rules.continuation.has(token.text);
}

function endsStatement(previous: Token, next: Token | undefined, rules: StatementRules): boolean {
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

function isEmptyStatementBody(previous: Token | undefined, rules: StatementRules): boolean {
  return (
    previous?.headerClose === true ||
    (previous?.kind === 'word' && rules.emptyBodies.has(previous.text)) ||
    isOp(previous, COLON)
  );
}

function addSemicolon(state: StatementLayoutState, token: Token): void {
  const { previous } = state;
  if (state.parens.length > 0 || isEmptyStatementBody(previous, state.rules)) {
    state.out.push(token);
    return;
  }
  if (previous !== undefined && !isOp(previous, STATEMENT_OPENERS)) {
    emitNewline(state, token.line);
  }
}

function endStatementBeforeBrace(state: StatementLayoutState): void {
  const index = state.out.findLastIndex((token) => token.kind !== 'comment');
  const last = state.out[index];
  if (last === undefined || last.text === NEWLINE || isOp(last, OPENING_BRACE)) {
    return;
  }
  state.out.splice(index + 1, 0, { kind: 'layout', text: NEWLINE, line: last.line });
}

function addStatementToken(state: StatementLayoutState, token: Token): void {
  if (isOp(token, SEMICOLON)) {
    addSemicolon(state, token);
    return;
  }
  if (isOp(token, CLOSING_BRACE)) {
    endStatementBeforeBrace(state);
  }
  state.out.push(token);
}

function tracked(state: StatementLayoutState, token: Token): Token {
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

function placeStatementToken(state: StatementLayoutState, token: Token): void {
  if (token.kind === 'comment') {
    state.pending.push(token);
    return;
  }
  const { previous, rules } = state;
  if (
    previous !== undefined &&
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

export function statementLayout(tokens: readonly Token[], rules: StatementRules): Token[] {
  const state: StatementLayoutState = {
    out: [],
    pending: [],
    previous: undefined,
    parens: [],
    rules,
  };
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
