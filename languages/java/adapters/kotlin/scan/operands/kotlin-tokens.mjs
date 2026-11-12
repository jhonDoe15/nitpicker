import { literalAt } from '../kotlin-source.mjs';

const TOKEN = new RegExp(
  [
    String.raw`\s+`,
    String.raw`as\?`,
    String.raw`[A-Za-z_]\w*`,
    '`[^`\\n]*`',
    String.raw`@[A-Za-z_]\w*`,
    String.raw`0[xX][\da-fA-F_]+[uUL]*`,
    String.raw`0[bB][01_]+[uUL]*`,
    String.raw`(?:\d[\d_]*)?\.?\d[\d_]*(?:[eE][+-]?\d+)?[fFuUL]*`,
    String.raw`'[^'\n]*'`,
    String.raw`===|!==|!in\b|!is\b|\.\.<|\?\.|\?:|::|->|&&|\|\||[=!<>]=|[+\-*/%]=|\+\+|--|!!|\.\.`,
    '"',
    String.raw`\S`,
  ].join('|'),
  'g',
);
const OPENERS = new Map([
  ['(', ')'],
  ['[', ']'],
  ['{', '}'],
]);
const CLOSERS = new Set(OPENERS.values());

function kindOf(text) {
  if (/^[A-Za-z_`]/.test(text)) {
    return 'word';
  }
  if (/^\.?\d/.test(text)) {
    return 'number';
  }
  if (text.startsWith('@')) {
    return 'at';
  }
  return text.startsWith("'") ? 'char' : 'mark';
}

function stringToken(scanned, start) {
  const literal = literalAt(scanned, start);
  if (literal === undefined) {
    return { kind: 'mark', text: '"', start, end: start + 1 };
  }
  const text = scanned.source.slice(literal.start, literal.end);
  return { kind: 'string', text, start, end: literal.end, literal };
}

function tokenAt(scanned, { index, 0: text }) {
  if (text === '"') {
    return stringToken(scanned, index);
  }
  const shown = text.startsWith("'") ? scanned.source.slice(index, index + text.length) : text;
  return { kind: kindOf(text), text: shown, start: index, end: index + text.length };
}

/** The tokens of a scanned Kotlin file, each saying whether a line break comes before it. */
export function kotlinTokens(scanned) {
  const tokens = [];
  const state = { newline: false, skipTo: 0 };
  for (const match of scanned.code.matchAll(TOKEN)) {
    const isSpace = /^\s/.test(match[0]);
    if (match.index >= state.skipTo && !isSpace) {
      const token = tokenAt(scanned, match);
      tokens.push({ ...token, newline: state.newline });
      state.skipTo = token.end;
      state.newline = false;
    }
    state.newline ||= isSpace && match.index >= state.skipTo && match[0].includes('\n');
  }
  return tokens;
}

function pairStep(tokens, open, index) {
  const { text } = tokens[index];
  if (OPENERS.has(text)) {
    open.push(index);
    return undefined;
  }
  const opener = CLOSERS.has(text) ? open.pop() : undefined;
  if (!CLOSERS.has(text)) {
    return undefined;
  }
  return opener !== undefined && OPENERS.get(tokens[opener].text) === text ? opener : -1;
}

/**
 * For each opening bracket token, the index of its closing token; undefined when they do not pair
 * up.
 */
export function closingTokens(tokens) {
  const closes = new Map();
  const open = [];
  for (const index of tokens.keys()) {
    const opener = pairStep(tokens, open, index);
    if (opener === -1) {
      return undefined;
    }
    if (opener !== undefined) {
      closes.set(opener, index);
    }
  }
  return open.length === 0 ? closes : undefined;
}
