import { tokenizeJvm } from './jvm-tokens.mjs';
import {
  annotationsEnd,
  bracketPairs,
  isKotlinModifier,
  javaMembers,
  kotlinMembers,
  skipNested,
} from './jvm-members.mjs';

const JAVA_MODIFIERS = new Set([
  'public',
  'protected',
  'private',
  'static',
  'final',
  'abstract',
  'native',
  'synchronized',
  'transient',
  'volatile',
  'strictfp',
  'default',
  'sealed',
  'non',
  '-',
]);
const JAVA_TYPES = new Map([
  ['class', 'class'],
  ['record', 'class'],
  ['enum', 'enum'],
  ['interface', 'interface'],
]);
const KOTLIN_TYPES = new Map([
  ['class', 'class'],
  ['object', 'class'],
  ['interface', 'interface'],
  ['typealias', 'type'],
]);
const LITERAL_WORDS = new Set(['true', 'false', 'null']);
const LITERAL_OPERATORS = new Set([
  '+',
  '-',
  '*',
  '/',
  '%',
  '(',
  ')',
  '!',
  '~',
  '<<',
  '&',
  '|',
  '^',
]);

function dottedName(tokens, index) {
  const parts = [];
  let position = index;
  while (tokens[position]?.kind === 'identifier' || tokens[position]?.text === '*') {
    parts.push(tokens[position].text);
    if (tokens[position + 1]?.text !== '.') {
      return { parts, end: position + 1 };
    }
    position += 2;
  }
  return { parts, end: position };
}

function importAt(tokens, index) {
  const isStatic = tokens[index + 1]?.text === 'static';
  const { parts, end } = dottedName(tokens, index + (isStatic ? 2 : 1));
  const aliased = tokens[end]?.text === 'as' && tokens[end + 1]?.kind === 'identifier';
  const wildcard = parts.at(-1) === '*';
  return {
    entry: {
      path: (wildcard ? parts.slice(0, -1) : parts).join('.'),
      wildcard,
      static: isStatic,
      ...(aliased ? { alias: tokens[end + 1].text } : {}),
    },
    end: aliased ? end + 2 : end,
  };
}

function readHeader(tokens, close) {
  const header = { packageName: '', imports: [], end: 0 };
  let index = 0;
  while (index < tokens.length) {
    index = annotationsEnd(tokens, close, index);
    const { text } = tokens[index] ?? {};
    if (text === 'package') {
      const { parts, end } = dottedName(tokens, index + 1);
      header.packageName = parts.join('.');
      index = end;
    } else if (text === 'import') {
      const { entry, end } = importAt(tokens, index);
      header.imports.push(entry);
      index = end;
    } else if (text === ';') {
      index += 1;
    } else {
      return { ...header, end: header.end };
    }
    header.end = index;
  }
  return header;
}

function firstAt(tokens, close, { from, to, texts }) {
  for (let index = from; index < to; index += 1) {
    if (texts.has(tokens[index].text)) {
      return index;
    }
    index = skipNested(close, index);
  }
  return -1;
}

function lastIdentifierBefore(tokens, from, to) {
  for (let index = to - 1; index >= from; index -= 1) {
    if (tokens[index].kind === 'identifier') {
      return index;
    }
  }
  return -1;
}

function bodyOf(tokens, close, { start, end }) {
  const open = firstAt(tokens, close, { from: start, to: end, texts: new Set(['{']) });
  return open === -1 ? undefined : { from: open + 1, to: Math.max(open + 1, close[open]) };
}

function modifiersOf(tokens, from, isModifier) {
  const modifiers = new Set();
  let index = from;
  while (tokens[index] !== undefined && isModifier(tokens[index].text)) {
    modifiers.add(tokens[index].text);
    index += 1;
  }
  return { modifiers, index };
}

function isLiteral(tokens) {
  return (
    tokens.length > 0 &&
    tokens.every(
      ({ kind, text }) =>
        kind === 'number' ||
        kind === 'char' ||
        (kind === 'string' && !text.includes('$')) ||
        LITERAL_WORDS.has(text) ||
        LITERAL_OPERATORS.has(text),
    )
  );
}

function initializer(tokens, close, { from, to }) {
  const assign = firstAt(tokens, close, { from, to, texts: new Set(['=']) });
  const end = tokens[to - 1]?.text === ';' ? to - 1 : to;
  return assign === -1 ? [] : tokens.slice(assign + 1, end);
}

function javaMember(tokens, close, member) {
  const start = annotationsEnd(tokens, close, member.start);
  const { modifiers, index } = modifiersOf(tokens, start, (text) => JAVA_MODIFIERS.has(text));
  const { text } = tokens[index] ?? {};
  if (text === '@' && tokens[index + 1]?.text === 'interface') {
    return { modifiers, kind: 'type', name: tokens[index + 2]?.text, type: true };
  }
  if (JAVA_TYPES.has(text)) {
    return { modifiers, kind: JAVA_TYPES.get(text), name: tokens[index + 1]?.text, type: true };
  }
  const mark = firstAt(tokens, close, {
    from: index,
    to: member.end,
    texts: new Set(['(', '=', ';', '{']),
  });
  if (mark !== -1 && tokens[mark].text === '(') {
    return { modifiers, kind: 'function', name: tokens[mark - 1]?.text, paren: mark, from: index };
  }
  const nameIndex = lastIdentifierBefore(tokens, index, mark === -1 ? member.end : mark);
  return { modifiers, kind: 'field', name: tokens[nameIndex]?.text };
}

function kotlinFunction(tokens, close, { from, to }) {
  for (let index = from; index < to; index += 1) {
    const previous = tokens[index - 1];
    if (tokens[index].text === '(' && previous?.kind === 'identifier' && previous.text !== 'fun') {
      return { kind: 'function', name: previous.text, paren: index };
    }
    if (tokens[index].text === '{' || tokens[index].text === '=') {
      return undefined;
    }
    index = tokens[index].text === '(' ? skipNested(close, index) : index;
  }
  return undefined;
}

function kotlinProperty(tokens, close, { from, to }) {
  if (tokens[from]?.text === '(') {
    return undefined;
  }
  const mark = firstAt(tokens, close, { from, to, texts: new Set([':', '=', 'by', 'get']) });
  const nameIndex = lastIdentifierBefore(tokens, from, mark === -1 ? to : mark);
  return nameIndex === -1 ? undefined : { kind: 'field', name: tokens[nameIndex].text };
}

function kotlinType(modifiers, keyword, nameToken) {
  const kind = modifiers.has('enum')
    ? 'enum'
    : modifiers.has('annotation')
      ? 'type'
      : KOTLIN_TYPES.get(keyword);
  const named = nameToken?.kind === 'identifier' && !isKotlinModifier(nameToken.text);
  return { kind, name: named ? nameToken.text : 'Companion', type: true };
}

function kotlinMember(tokens, close, member) {
  const start = annotationsEnd(tokens, close, member.start);
  const { modifiers, index } = modifiersOf(tokens, start, isKotlinModifier);
  const keyword = tokens[index]?.text;
  const range = { from: index + 1, to: member.end };
  if (keyword === 'fun' && tokens[index + 1]?.text === 'interface') {
    return { modifiers, kind: 'interface', name: tokens[index + 2]?.text, type: true };
  }
  if (KOTLIN_TYPES.has(keyword)) {
    return { modifiers, keyword, ...kotlinType(modifiers, keyword, tokens[index + 1]) };
  }
  const found =
    keyword === 'fun'
      ? kotlinFunction(tokens, close, range)
      : keyword === 'val'
        ? kotlinProperty(tokens, close, range)
        : undefined;
  return found === undefined ? undefined : { modifiers, ...found, from: index };
}

export const LANGUAGE_RULES = {
  java: { members: javaMembers, member: javaMember },
  kotlin: { members: kotlinMembers, member: kotlinMember },
};

export function parseStructure(source, { kotlin }) {
  const tokens = tokenizeJvm(source, { kotlin });
  const close = bracketPairs(tokens);
  return { tokens, close, header: readHeader(tokens, close) };
}

export { bodyOf, initializer, isLiteral };
