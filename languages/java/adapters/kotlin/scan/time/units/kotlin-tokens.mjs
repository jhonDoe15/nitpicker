const SPACE = /[ \t\r\f]+/y;
const STRING = /"""[\s\S]*?"""|"[^"\n]*"|'[^'\n]*'/y;
const NUMBER = /0[xX][\da-fA-F_]+[uU]?[lL]?|\d[\d_]*(?:\.\d[\d_]*)?(?:[eE][+-]?\d+)?[fFlLuU]*/y;
const IDENTIFIER = /[A-Za-z_$][\w$]*|`[^`\n]+`/y;
const OPERATOR =
  /===|!==|\?\.|\?:|!!|==|!=|<=|>=|&&|\|\||\+=|-=|\*=|\/=|->|::|\.\.|[-+*/%<>=()[\]{},.:;!?@&|^~#]/y;
const OPENERS = { '(': ')', '[': ']', '{': '}' };
const CLOSERS = new Set([')', ']', '}']);
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

function read(pattern, code, at) {
  pattern.lastIndex = at;
  const match = pattern.exec(code);
  return match === null ? undefined : match[0];
}

function numberValue(text) {
  const cleaned = text.replaceAll('_', '').replace(/[fFlLuU]+$/u, '');
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : undefined;
}

function nextToken(code, at) {
  const string = read(STRING, code, at);
  if (string !== undefined) {
    return { kind: 'str', text: string };
  }
  const number = read(NUMBER, code, at);
  if (number !== undefined) {
    return { kind: 'num', text: number, value: numberValue(number) };
  }
  const identifier = read(IDENTIFIER, code, at);
  if (identifier !== undefined) {
    return { kind: 'id', text: identifier.replaceAll('`', '') };
  }
  const operator = read(OPERATOR, code, at);
  return { kind: 'op', text: operator ?? code[at] };
}

function rawTokens(code) {
  const tokens = [];
  let at = 0;
  while (at < code.length) {
    const space = read(SPACE, code, at);
    if (space !== undefined) {
      at += space.length;
    } else if (code[at] === '\n') {
      tokens.push({ kind: 'nl', text: '\n', start: at, end: at + 1 });
      at += 1;
    } else {
      const token = nextToken(code, at);
      const length = Math.max(1, token.text.length);
      tokens.push({ ...token, start: at, end: at + length });
      at += length;
    }
  }
  return tokens;
}

function withBrackets(tokens) {
  const stack = [];
  return tokens.map((token) => {
    const inside = stack.at(-1);
    if (OPENERS[token.text] !== undefined && token.kind === 'op') {
      stack.push(token.text);
    } else if (CLOSERS.has(token.text) && token.kind === 'op') {
      stack.pop();
    }
    return { ...token, inside };
  });
}

function neighbours(tokens) {
  const previous = [];
  const next = [];
  let last;
  tokens.forEach((token, index) => {
    previous[index] = last;
    last = token.kind === 'nl' ? last : token;
  });
  last = undefined;
  for (let index = tokens.length - 1; index >= 0; index -= 1) {
    next[index] = last;
    last = tokens[index].kind === 'nl' ? last : tokens[index];
  }
  return { previous, next };
}

function isOperator(token, texts) {
  return token !== undefined && token.kind === 'op' && texts.has(token.text);
}

export function kotlinTokens(code) {
  const tokens = withBrackets(rawTokens(code));
  const { previous, next } = neighbours(tokens);
  return tokens.filter(
    (token, index) =>
      token.kind !== 'nl' ||
      (token.inside !== '(' &&
        token.inside !== '[' &&
        !isOperator(previous[index], DANGLING) &&
        !isOperator(next[index], CONTINUATIONS)),
  );
}

export function closingIndex(tokens, open) {
  let depth = 0;
  for (let index = open; index < tokens.length; index += 1) {
    const { text, kind } = tokens[index];
    if (kind === 'op' && OPENERS[text] !== undefined) {
      depth += 1;
    } else if (kind === 'op' && CLOSERS.has(text)) {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }
  return tokens.length - 1;
}
