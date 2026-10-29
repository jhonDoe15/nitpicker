const OPENERS = new Map([
  ['(', ')'],
  ['[', ']'],
  ['{', '}'],
]);
const CLOSERS = new Set(OPENERS.values());
const KOTLIN_MODIFIERS = new Set([
  'public',
  'private',
  'protected',
  'internal',
  'open',
  'final',
  'abstract',
  'sealed',
  'data',
  'enum',
  'annotation',
  'inner',
  'value',
  'inline',
  'override',
  'lateinit',
  'const',
  'suspend',
  'operator',
  'infix',
  'tailrec',
  'external',
  'expect',
  'actual',
  'companion',
]);
const KOTLIN_KEYWORDS = new Set([
  'fun',
  'val',
  'var',
  'class',
  'interface',
  'object',
  'typealias',
  'init',
  'constructor',
]);

export function bracketPairs(tokens) {
  const close = new Int32Array(tokens.length).fill(-1);
  const open = [];
  for (const [index, { text, kind }] of tokens.entries()) {
    if (kind !== 'operator') {
      continue;
    }
    if (OPENERS.has(text)) {
      open.push(index);
    } else if (
      CLOSERS.has(text) &&
      open.length > 0 &&
      OPENERS.get(tokens[open.at(-1)].text) === text
    ) {
      close[open.pop()] = index;
    }
  }
  return close;
}

export function skipNested(close, index) {
  return close[index] > index ? close[index] : index;
}

function isInitializerBrace(tokens, close, { from, index }) {
  for (let position = from; position < index; position = skipNested(close, position) + 1) {
    if (tokens[position].text === '=' || tokens[position].text === '->') {
      return true;
    }
  }
  return false;
}

export function javaMembers(tokens, close, { from, to }) {
  const members = [];
  let start = from;
  for (let index = from; index < to; index += 1) {
    const { text } = tokens[index];
    if (text === '{' && !isInitializerBrace(tokens, close, { from: start, index })) {
      const end = skipNested(close, index);
      members.push({ start, end: end + 1 });
      start = end + 1;
      index = end;
    } else if (text === ';') {
      if (index > start) {
        members.push({ start, end: index + 1 });
      }
      start = index + 1;
    } else {
      index = skipNested(close, index);
    }
  }
  return members;
}

function startsKotlinMember(tokens, index) {
  const { text } = tokens[index];
  const previous = tokens[index - 1];
  const newLine =
    previous === undefined || previous.line < tokens[index].line || previous.text === ';';
  return newLine && (text === '@' || KOTLIN_MODIFIERS.has(text) || KOTLIN_KEYWORDS.has(text));
}

function declares(tokens, from, to) {
  return tokens.slice(from, to).some(({ text }) => KOTLIN_KEYWORDS.has(text));
}

export function kotlinMembers(tokens, close, { from, to }) {
  const starts = [];
  for (let index = from; index < to; index += 1) {
    const pending = starts.length > 0 && !declares(tokens, starts.at(-1), index);
    if (!pending && startsKotlinMember(tokens, index)) {
      starts.push(index);
    }
    index = skipNested(close, index);
  }
  return starts.map((start, position) => ({
    start,
    end: trimmedEnd(tokens, start, starts[position + 1] ?? to),
  }));
}

function trimmedEnd(tokens, start, end) {
  let last = end;
  while (last > start + 1 && tokens[last - 1].text === ';') {
    last -= 1;
  }
  return last;
}

export function annotationsEnd(tokens, close, from) {
  let index = from;
  while (tokens[index]?.text === '@' && tokens[index + 1]?.text !== 'interface') {
    index += tokens[index + 1]?.text === '[' ? 1 : 2;
    while (tokens[index]?.text === '.' || tokens[index]?.text === ':') {
      index += 2;
    }
    if (tokens[index]?.text === '(' || tokens[index]?.text === '[') {
      index = skipNested(close, index) + 1;
    }
  }
  return index;
}

export function isKotlinModifier(text) {
  return KOTLIN_MODIFIERS.has(text);
}
