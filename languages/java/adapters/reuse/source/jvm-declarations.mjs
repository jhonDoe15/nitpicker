import { tokenizeJvm } from './jvm-tokens.mjs';
import {
  annotationsEnd,
  bracketPairs,
  isKotlinModifier,
  javaMembers,
  kotlinMembers,
  MAX_MODIFIERS,
  topLevelIndexes,
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
const NAME_PARTS = new Set(['identifier']);
const BODY_OPENERS = new Set(['{']);
const ASSIGNMENT = new Set(['=']);
const ANGLE_DEPTH = new Map([
  ['<', 1],
  ['>', -1],
]);
const JAVA_MEMBER_MARKS = new Set(['(', '=', ';', '{']);
const PROPERTY_MARKS = new Set([':', '=', 'by', 'get']);
const FUNCTION_MARKS = new Set(['(', '{', '=']);
const TYPE_MODIFIERS = ['enum', 'annotation'];
const TYPE_MODIFIER_KINDS = new Map([
  ['enum', 'enum'],
  ['annotation', 'type'],
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

function isNamePart(token) {
  return NAME_PARTS.has(token?.kind) || token?.text === '*';
}

function dottedName(tokens, index) {
  const parts = [];
  const positions = [index];
  for (const position of positions) {
    if (isNamePart(tokens[position])) {
      parts.push(tokens[position].text);
      positions.push(...(tokens[position + 1]?.text === '.' ? [position + 2] : []));
    }
  }
  const last = positions.at(-1);
  return { parts, end: isNamePart(tokens[last]) ? last + 1 : Math.max(index, last - 1) };
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

function headerStep(tokens, header, index) {
  const { text } = tokens[index] ?? {};
  if (text === 'package') {
    const { parts, end } = dottedName(tokens, index + 1);
    header.packageName = parts.join('.');
    return end;
  }
  if (text === 'import') {
    const { entry, end } = importAt(tokens, index);
    header.imports.push(entry);
    return end;
  }
  return text === ';' ? index + 1 : undefined;
}

function readHeader(tokens, close) {
  const header = { packageName: '', imports: [], end: 0 };
  const positions = [0];
  for (const position of positions) {
    const next = headerStep(tokens, header, annotationsEnd(tokens, close, position));
    if (next !== undefined) {
      header.end = next;
      positions.push(next);
    }
  }
  return header;
}

function firstAt(tokens, close, { from, to, texts }) {
  return topLevelIndexes(close, { from, to }).find((index) => texts.has(tokens[index].text)) ?? -1;
}

function lastIdentifierBefore(tokens, from, to) {
  const found = tokens.slice(from, to).findLastIndex(({ kind }) => kind === 'identifier');
  return found === -1 ? -1 : from + found;
}

function bodyOf(tokens, close, { start, end }) {
  const open = firstAt(tokens, close, { from: start, to: end, texts: BODY_OPENERS });
  return open === -1 ? undefined : { from: open + 1, to: Math.max(open + 1, close[open]) };
}

function modifiersOf(tokens, from, isModifier) {
  const window = tokens.slice(from, from + MAX_MODIFIERS);
  const count = window.findIndex(({ text }) => !isModifier(text));
  const index = from + (count === -1 ? window.length : count);
  return { modifiers: new Set(tokens.slice(from, index).map(({ text }) => text)), index };
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
  const assign = firstAt(tokens, close, { from, to, texts: ASSIGNMENT });
  const end = tokens[to - 1]?.text === ';' ? to - 1 : to;
  return assign === -1 ? [] : tokens.slice(assign + 1, end);
}

function javaModifiers(tokens, close, from) {
  const modifiers = new Set();
  const positions = [from];
  for (const index of positions) {
    const { text } = tokens[index] ?? {};
    if (text === '@' && tokens[index + 1]?.text !== 'interface') {
      positions.push(annotationsEnd(tokens, close, index));
    } else if (JAVA_MODIFIERS.has(text)) {
      modifiers.add(text);
      positions.push(index + 1);
    }
  }
  return { modifiers, index: positions.at(-1) };
}

function declaresSeveral(tokens, close, range) {
  let depth = 0;
  let assigned = false;
  for (const index of topLevelIndexes(close, range)) {
    const { text } = tokens[index];
    depth += assigned ? 0 : (ANGLE_DEPTH.get(text) ?? 0);
    assigned = assigned || text === '=';
    if (text === ',' && depth === 0) {
      return true;
    }
  }
  return false;
}

function javaMember(tokens, close, member) {
  const { modifiers, index } = javaModifiers(tokens, close, member.start);
  const { text } = tokens[index] ?? {};
  if (text === '@' && tokens[index + 1]?.text === 'interface') {
    return { modifiers, kind: 'type', name: tokens[index + 2]?.text, type: true };
  }
  if (JAVA_TYPES.has(text)) {
    return { modifiers, kind: JAVA_TYPES.get(text), name: tokens[index + 1]?.text, type: true };
  }
  const mark = firstAt(tokens, close, { from: index, to: member.end, texts: JAVA_MEMBER_MARKS });
  if (mark !== -1 && tokens[mark].text === '(') {
    return { modifiers, kind: 'function', name: tokens[mark - 1]?.text, paren: mark, from: index };
  }
  const nameIndex = lastIdentifierBefore(tokens, index, mark === -1 ? member.end : mark);
  const kind = declaresSeveral(tokens, close, { from: index, to: member.end }) ? 'fields' : 'field';
  return { modifiers, kind, name: tokens[nameIndex]?.text };
}

function kotlinFunction(tokens, close, range) {
  const stops = topLevelIndexes(close, range).filter((index) =>
    FUNCTION_MARKS.has(tokens[index].text),
  );
  const paren = stops.find(
    (index) =>
      tokens[index].text === '(' &&
      tokens[index - 1]?.kind === 'identifier' &&
      tokens[index - 1].text !== 'fun',
  );
  const stop = stops.find((index) => tokens[index].text !== '(');
  return paren === undefined || (stop !== undefined && stop < paren)
    ? undefined
    : { kind: 'function', name: tokens[paren - 1].text, paren };
}

function kotlinProperty(tokens, close, { from, to }) {
  if (tokens[from]?.text === '(') {
    return undefined;
  }
  const mark = firstAt(tokens, close, { from, to, texts: PROPERTY_MARKS });
  const nameIndex = lastIdentifierBefore(tokens, from, mark === -1 ? to : mark);
  return nameIndex === -1 ? undefined : { kind: 'field', name: tokens[nameIndex].text };
}

function kotlinTypeKind(modifiers, keyword) {
  const marked = TYPE_MODIFIERS.find((modifier) => modifiers.has(modifier));
  return marked === undefined ? KOTLIN_TYPES.get(keyword) : TYPE_MODIFIER_KINDS.get(marked);
}

function kotlinType(modifiers, keyword, nameToken) {
  const named = nameToken?.kind === 'identifier' && !isKotlinModifier(nameToken.text);
  const companion = modifiers.has('companion') ? 'Companion' : undefined;
  return {
    kind: kotlinTypeKind(modifiers, keyword),
    name: named ? nameToken.text : companion,
    type: true,
  };
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
  const found = KOTLIN_MEMBER_READERS.get(keyword)?.(tokens, close, range);
  return found === undefined ? undefined : { modifiers, ...found, from: index };
}

function kotlinVariable(tokens, close, range) {
  const found = kotlinProperty(tokens, close, range);
  return found === undefined ? undefined : { ...found, kind: 'variable' };
}

const KOTLIN_MEMBER_READERS = new Map([
  ['fun', kotlinFunction],
  ['val', kotlinProperty],
  ['var', kotlinVariable],
]);

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
