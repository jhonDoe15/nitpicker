import type { Parser, RawUnitToken, UnitToken } from './unit-shapes.mts';

export const KEYWORDS: ReadonlySet<string> = new Set([
  'if',
  'else',
  'when',
  'while',
  'for',
  'do',
  'return',
  'val',
  'var',
  'fun',
  'in',
  'is',
  'as',
  'throw',
  'try',
  'catch',
  'finally',
  'object',
  'class',
  'interface',
  'null',
  'true',
  'false',
  'import',
  'package',
  'typealias',
  'break',
  'continue',
]);
const SPACE = /[ \t\r\f]+/;
const STRING = /"""[\s\S]*?"""|"[^"\n]*"|'[^'\n]*'/;
const NUMBER = /0[xX][\da-fA-F_]+[uU]?[lL]?|\d[\d_]*(?:\.\d[\d_]*)?(?:[eE][+-]?\d+)?[fFlLuU]*/;
const IDENTIFIER = /[A-Za-z_$][\w$]*|`[^`\n]+`/;
const OPERATOR =
  /===|!==|\?\.|\?:|!!|==|!=|<=|>=|&&|\|\||\+=|-=|\*=|\/=|->|::|\.\.|[-+*/%<>=()[\]{},.:;!?@&|^~#]/;
const OPENERS: Readonly<Record<string, string>> = { '(': ')', '[': ']', '{': '}' };
const CLOSERS = new Set([')', ']', '}']);
const OPENING = new Set(Object.keys(OPENERS));
const CONTINUATIONS = new Set(['.', '?.', '?:', '&&', '||']);
const DANGLING = new Set([
  '+',
  '-',
  '*',
  '/',
  '%',
  '=',
  '==',
  '!=',
  '<',
  '>',
  '<=',
  '>=',
  '&&',
  '||',
  '.',
  '?.',
  ',',
  '(',
  '[',
  '+=',
  '-=',
  '->',
  '?:',
]);

const TOKEN = new RegExp(
  [
    String.raw`(?<nl>\n)`,
    `(?<space>${SPACE.source})`,
    `(?<str>${STRING.source})`,
    `(?<num>${NUMBER.source})`,
    `(?<id>${IDENTIFIER.source})`,
    `(?<op>${OPERATOR.source}|[\\s\\S])`,
  ].join('|'),
  'g',
);

function numberValue(text: string): number | undefined {
  const cleaned = text.replaceAll('_', '').replace(/[fFlLuU]+$/u, '');
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : undefined;
}

function quotedMark(text: string): { readonly quoted?: true } {
  return text.startsWith('`') ? { quoted: true } : {};
}

function tokenOf(match: RegExpExecArray): RawUnitToken {
  const [text] = match;
  const groups = match.groups ?? {};
  const kind = Object.keys(groups).find((group) => groups[group] !== undefined) ?? '';
  const token = { kind, text, start: match.index, end: match.index + text.length };
  if (kind === 'num') {
    return { ...token, value: numberValue(text) };
  }
  return kind === 'id' ? { ...token, text: text.replaceAll('`', ''), ...quotedMark(text) } : token;
}

function rawTokens(code: string): RawUnitToken[] {
  return [...code.matchAll(TOKEN)].map(tokenOf).filter(({ kind }) => kind !== 'space');
}

function withBrackets(tokens: RawUnitToken[]): UnitToken[] {
  const stack: string[] = [];
  return tokens.map((token): UnitToken => {
    const inside = stack.at(-1);
    const nesting = stack.length;
    if (OPENERS[token.text] !== undefined && token.kind === 'op') {
      stack.push(token.text);
    } else if (CLOSERS.has(token.text) && token.kind === 'op') {
      stack.pop();
    }
    return { ...token, inside, nesting };
  });
}

function lastSignificant(tokens: UnitToken[]): (UnitToken | undefined)[] {
  const found: (UnitToken | undefined)[] = [];
  let last: UnitToken | undefined;
  for (const token of tokens) {
    found.push(last);
    last = token.kind === 'nl' ? last : token;
  }
  return found;
}

export function isOperator(token: UnitToken | undefined, texts: Set<string>): boolean {
  return token !== undefined && token.kind === 'op' && texts.has(token.text);
}

function withClosers(tokens: UnitToken[]): UnitToken[] {
  const open: number[] = [];
  const closers = new Map<number, number>();
  for (const [index, token] of tokens.entries()) {
    if (isOperator(token, OPENING)) {
      open.push(index);
    } else if (isOperator(token, CLOSERS) && open.length > 0) {
      closers.set(open.pop() ?? index, index);
    }
  }
  return tokens.map((token, index) =>
    closers.has(index) ? { ...token, close: closers.get(index) } : token,
  );
}

export function kotlinTokens(code: string): UnitToken[] {
  const tokens = withBrackets(rawTokens(code));
  const previous = lastSignificant(tokens);
  const next = lastSignificant(tokens.toReversed()).toReversed();
  return withClosers(
    tokens.filter(
      (token, index) =>
        token.kind !== 'nl' ||
        (token.inside !== '(' &&
          token.inside !== '[' &&
          !isOperator(previous[index], DANGLING) &&
          !isOperator(next[index], CONTINUATIONS)),
    ),
  );
}

export function closingIndex(tokens: UnitToken[], open: number): number {
  return tokens[open]?.close ?? tokens.length - 1;
}

export function peek(parser: Parser, offset = 0): UnitToken | undefined {
  return parser.tokens[parser.position + offset];
}

export function at(parser: Parser, text: string, offset = 0): boolean {
  const token = peek(parser, offset);
  return token?.kind === 'op' && token.text === text;
}

export function upcoming(
  parser: Parser,
  holds: (token: UnitToken) => boolean,
): IterableIterator<UnitToken> {
  return {
    [Symbol.iterator]() {
      return this;
    },
    next(): IteratorResult<UnitToken, undefined> {
      const token = peek(parser);
      return token !== undefined && holds(token)
        ? { done: false, value: token }
        : { done: true, value: undefined };
    },
  };
}

function moveTo(parser: Parser, position: number): void {
  parser.position = position;
}

export function skipBracket(parser: Parser): void {
  moveTo(parser, closingIndex(parser.tokens, parser.position) + 1);
}
