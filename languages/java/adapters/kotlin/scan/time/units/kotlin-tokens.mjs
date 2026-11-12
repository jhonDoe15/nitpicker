const SPACE = /[ \t\r\f]+/;
const STRING = /"""[\s\S]*?"""|"[^"\n]*"|'[^'\n]*'/;
const NUMBER = /0[xX][\da-fA-F_]+[uU]?[lL]?|\d[\d_]*(?:\.\d[\d_]*)?(?:[eE][+-]?\d+)?[fFlLuU]*/;
const IDENTIFIER = /[A-Za-z_$][\w$]*|`[^`\n]+`/;
const OPERATOR =
  /===|!==|\?\.|\?:|!!|==|!=|<=|>=|&&|\|\||\+=|-=|\*=|\/=|->|::|\.\.|[-+*/%<>=()[\]{},.:;!?@&|^~#]/;
const OPENERS = { '(': ')', '[': ']', '{': '}' };
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

function numberValue(text) {
  const cleaned = text.replaceAll('_', '').replace(/[fFlLuU]+$/u, '');
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : undefined;
}

function tokenOf(match) {
  const [text] = match;
  const kind = Object.keys(match.groups).find((group) => match.groups[group] !== undefined);
  const token = { kind, text, start: match.index, end: match.index + text.length };
  if (kind === 'num') {
    return { ...token, value: numberValue(text) };
  }
  return kind === 'id'
    ? { ...token, text: text.replaceAll('`', ''), quoted: text.startsWith('`') }
    : token;
}

function rawTokens(code) {
  return [...code.matchAll(TOKEN)].map(tokenOf).filter(({ kind }) => kind !== 'space');
}

function withBrackets(tokens) {
  const stack = [];
  return tokens.map((token) => {
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

function lastSignificant(tokens) {
  const found = [];
  let last;
  for (const token of tokens) {
    found.push(last);
    last = token.kind === 'nl' ? last : token;
  }
  return found;
}

export function isOperator(token, texts) {
  return token !== undefined && token.kind === 'op' && texts.has(token.text);
}

function withClosers(tokens) {
  const open = [];
  const closers = new Map();
  for (const [index, token] of tokens.entries()) {
    if (isOperator(token, OPENING)) {
      open.push(index);
    } else if (isOperator(token, CLOSERS) && open.length > 0) {
      closers.set(open.pop(), index);
    }
  }
  return tokens.map((token, index) =>
    closers.has(index) ? { ...token, close: closers.get(index) } : token,
  );
}

export function kotlinTokens(code) {
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

export function closingIndex(tokens, open) {
  return tokens[open]?.close ?? tokens.length - 1;
}

export function peek(parser, offset = 0) {
  return parser.tokens[parser.position + offset];
}

export function at(parser, text, offset = 0) {
  const token = peek(parser, offset);
  return token?.kind === 'op' && token.text === text;
}

export function upcoming(parser, holds) {
  return {
    [Symbol.iterator]() {
      return this;
    },
    next() {
      const token = peek(parser);
      return token !== undefined && holds(token)
        ? { done: false, value: token }
        : { done: true, value: undefined };
    },
  };
}

export function skipBracket(parser) {
  parser.position = closingIndex(parser.tokens, parser.position) + 1;
}
