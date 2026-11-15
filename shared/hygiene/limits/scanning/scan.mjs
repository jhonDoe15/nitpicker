const STRING_SOURCE =
  String.raw`"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|` + '`(?:\\\\.|[^`\\\\])*`';
const BRACKET = String.raw`[(){}[\]]`;
const BRACKET_TOKEN = new RegExp(`${STRING_SOURCE}|${BRACKET}`, 'gu');
const COMMA_TOKEN = new RegExp(`${STRING_SOURCE}|${BRACKET}|,`, 'gu');
const CHUNK = new RegExp(`${STRING_SOURCE}|[\\s\\S]`, 'gu');
const PAIRS = { '(': ')', '{': '}', '[': ']' };
const PAREN = { '(': 1, ')': -1 };
const DEPTH = { '(': 1, '{': 1, '[': 1, ')': -1, '}': -1, ']': -1 };
const NON_NEWLINE = /[^\n]/gu;
const BLOCK_COMMENT = /\/\*[\s\S]*?\*\//gu;
const SLASH_COMMENT = /^[ \t]*\/\/[^\n]*/gmu;
const HASH_COMMENT = /^[ \t]*#[^\n]*/gmu;

function blank(match) {
  return match.replaceAll(NON_NEWLINE, ' ');
}

export function blankComments(text, { hash = false } = {}) {
  return text
    .replaceAll(BLOCK_COMMENT, blank)
    .replaceAll(hash ? HASH_COMMENT : SLASH_COMMENT, blank);
}

export function closingIndex(text, open) {
  const opener = text[open];
  const closer = PAIRS[opener];
  let depth = 0;
  for (const token of text.slice(open).matchAll(BRACKET_TOKEN)) {
    depth += Number(token[0] === opener) - Number(token[0] === closer);
    if (depth === 0) {
      return open + token.index;
    }
  }
  return text.length;
}

function separatorIndexes(text) {
  const found = [];
  let depth = 0;
  for (const token of text.matchAll(COMMA_TOKEN)) {
    depth += DEPTH[token[0]] ?? 0;
    if (token[0] === ',' && depth === 0) {
      found.push(token.index);
    }
  }
  return found;
}

export function splitTopLevel(text) {
  const cuts = [-1, ...separatorIndexes(text), text.length];
  return cuts.slice(0, -1).map((cut, position) => ({
    text: text.slice(cut + 1, cuts[position + 1]),
    offset: cut + 1,
  }));
}

const STRING_LITERAL = /^(?:"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'|r(?:"([^"]*)"|'([^']*)'))$/u;
const REGEX_LITERAL = /^\/((?:\\.|[^/\\])+)\/[a-z]*$/u;
const NUMBER = /^-?\d+(?:\.\d+)?$/u;
const CLASS_LITERAL = /^@?\w+\.class$/u;
const ASSIGNMENT = /^\s*(\w+)\s*[=:]/u;
const QUOTED_START = /^\s*["'/]/u;
const TRUE = 'true';
const FALSE = 'false';

function literalValue(raw) {
  const text = raw.trim().replace(CLASS_LITERAL, '');
  if (NUMBER.test(text)) {
    return Number(text);
  }
  if (text === TRUE || text === FALSE) {
    return text === TRUE;
  }
  const string = STRING_LITERAL.exec(text);
  if (string === null) {
    return REGEX_LITERAL.exec(text)?.[1];
  }
  const [, double, single, rawDouble, rawSingle] = string;
  return (double ?? single)?.replaceAll('\\\\', '\\') ?? rawDouble ?? rawSingle;
}

export function parseArguments(text) {
  const named = new Map();
  const positional = [];
  for (const { text: part } of splitTopLevel(text)) {
    const assignment = QUOTED_START.test(part) ? undefined : (ASSIGNMENT.exec(part) ?? undefined);
    if (assignment !== undefined) {
      named.set(assignment[1], literalValue(part.slice(assignment[0].length)));
    } else if (part.trim() !== '') {
      positional.push(literalValue(part));
    }
  }
  return { named, positional };
}

function insideBraces(chunk, state) {
  state.braces += Number(chunk === '{') - Number(chunk === '}');
  const closed = chunk === '}' && state.braces === 0;
  return closed ? chunk : blank(chunk);
}

function maskedChunk(chunk, state) {
  if (state.braces > 0) {
    return insideBraces(chunk, state);
  }
  const insideParens = state.parens > 0;
  state.parens = Math.max(0, state.parens + (PAREN[chunk] ?? 0));
  if (insideParens || chunk !== '{') {
    return chunk;
  }
  state.braces = 1;
  return chunk;
}

export function topLevelText(body) {
  const state = { braces: 0, parens: 0 };
  return [...body.matchAll(CHUNK)].map(([chunk]) => maskedChunk(chunk, state)).join('');
}

const NEWLINE = /\n/g;

export function lineAt(text, index) {
  return [...text.slice(0, index).matchAll(NEWLINE)].length + 1;
}
