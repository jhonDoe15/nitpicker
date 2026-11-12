const OPENERS = new Map([
  ['(', ')'],
  ['[', ']'],
  ['{', '}'],
]);
const CLOSERS = new Set(OPENERS.values());
export const MAX_MODIFIERS = 16;
const MEMBER_BOUNDARIES = new Set([';', '{']);
const CONTINUATIONS = new Set([
  '=',
  ',',
  '(',
  '[',
  '->',
  ':',
  '&&',
  '||',
  '+',
  '-',
  '*',
  '/',
  '%',
  '.',
  '?.',
  '?:',
  '!',
  '==',
  '!=',
  '===',
  '!==',
  '<=',
  '>=',
  '..',
  '..<',
  '::',
  'in',
  'is',
  'as',
  '+=',
  '-=',
  '*=',
  '/=',
  '%=',
]);
const INITIALIZER_MARKS = new Set(['=', '->']);
const NAME_SEPARATORS = new Set(['.', ':']);
const ARGUMENT_OPENERS = new Set(['(', '[']);
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

function skipNested(close, index) {
  return close[index] > index ? close[index] : index;
}

export function topLevelIndexes(close, { from, to }) {
  const indexes = [];
  const positions = [from];
  for (const index of positions) {
    if (index < to) {
      indexes.push(index);
      positions.push(skipNested(close, index) + 1);
    }
  }
  return indexes;
}

function isInitializerBrace(tokens, close, { start, index }) {
  return topLevelIndexes(close, { from: start, to: index }).some((position) =>
    INITIALIZER_MARKS.has(tokens[position].text),
  );
}

function javaMemberEnd(tokens, close, { start, index }) {
  const { text } = tokens[index];
  if (text === '{' && !isInitializerBrace(tokens, close, { start, index })) {
    return skipNested(close, index) + 1;
  }
  return text === ';' ? index + 1 : undefined;
}

export function javaMembers(tokens, close, range) {
  const members = [];
  let start = range.from;
  for (const index of topLevelIndexes(close, range)) {
    const end = javaMemberEnd(tokens, close, { start, index });
    if (end !== undefined && end - start > 1) {
      members.push({ start, end });
    }
    start = end ?? start;
  }
  return members;
}

function startsLine(tokens, index) {
  const previous = tokens[index - 1];
  return (
    previous === undefined ||
    MEMBER_BOUNDARIES.has(previous.text) ||
    (previous.line < tokens[index].line && !CONTINUATIONS.has(previous.text))
  );
}

function declaresAhead(tokens, index) {
  const ahead = tokens.slice(index, index + MAX_MODIFIERS);
  const keyword = ahead.findIndex(({ text }) => KOTLIN_KEYWORDS.has(text));
  return keyword !== -1 && ahead.slice(0, keyword).every(({ text }) => KOTLIN_MODIFIERS.has(text));
}

function startsKotlinMember(tokens, { index, from }) {
  const { text } = tokens[index];
  if (index !== from && !startsLine(tokens, index)) {
    return false;
  }
  return text === '@' || KOTLIN_KEYWORDS.has(text) || declaresAhead(tokens, index);
}

function trimmedEnd(tokens, start, end) {
  const kept = tokens.slice(start + 1, end).findLastIndex(({ text }) => text !== ';');
  return start + 2 + kept;
}

export function kotlinMembers(tokens, close, range) {
  const starts = [];
  let declared = true;
  for (const index of topLevelIndexes(close, range)) {
    const { text } = tokens[index];
    if (declared && startsKotlinMember(tokens, { index, from: range.from })) {
      starts.push(index);
      declared = KOTLIN_KEYWORDS.has(text);
    } else {
      declared = declared || KOTLIN_KEYWORDS.has(text);
    }
  }
  return starts.map((start, position) => ({
    start,
    end: trimmedEnd(tokens, start, starts[position + 1] ?? range.to),
  }));
}

function nameEnd(tokens, from) {
  const positions = [from];
  for (const index of positions) {
    if (NAME_SEPARATORS.has(tokens[index]?.text)) {
      positions.push(index + 2);
    }
  }
  return positions.at(-1);
}

function annotationEnd(tokens, close, at) {
  const name = nameEnd(tokens, tokens[at + 1]?.text === '[' ? at + 1 : at + 2);
  return ARGUMENT_OPENERS.has(tokens[name]?.text) ? skipNested(close, name) + 1 : name;
}

function startsAnnotation(tokens, index) {
  return tokens[index]?.text === '@' && tokens[index + 1]?.text !== 'interface';
}

export function annotationsEnd(tokens, close, from) {
  const positions = [from];
  for (const index of positions) {
    if (startsAnnotation(tokens, index)) {
      positions.push(annotationEnd(tokens, close, index));
    }
  }
  return positions.at(-1);
}

export function isKotlinModifier(text) {
  return KOTLIN_MODIFIERS.has(text);
}
