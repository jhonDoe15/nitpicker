import { tokenizeJvm } from './jvm-tokens.mts';
import {
  annotationsEnd,
  bracketPairs,
  isKotlinModifier,
  javaMembers,
  kotlinMembers,
  MAX_MODIFIERS,
  textAt,
  topLevelIndexes,
} from './jvm-members.mts';
import type { ImportEntry, Token } from '../jvm-reuse-types.mts';
import type {
  Header,
  LanguageRules,
  Member,
  MemberInfo,
  Range,
  Structure,
} from './jvm-source-types.mts';

import {
  INTERFACE,
  JAVA_MODIFIERS,
  JAVA_TYPES,
  KOTLIN_TYPES,
  NAME_PARTS,
  BODY_OPENERS,
  ASSIGNMENT,
  ANGLE_DEPTH,
  JAVA_MEMBER_MARKS,
  PROPERTY_MARKS,
  FUNCTION_MARKS,
  TYPE_MODIFIERS,
  TYPE_MODIFIER_KINDS,
  LITERAL_WORDS,
  LITERAL_OPERATORS,
} from './declarations/declaration-words.mts';

type Tokens = readonly Token[];
type Found = Pick<MemberInfo, 'kind' | 'name'> & { readonly paren?: number };
type MemberReader = (tokens: Tokens, close: Int32Array, range: Range) => Found | undefined;

function isNamePart(token: Token | undefined): boolean {
  return NAME_PARTS.has(token?.kind ?? '') || token?.text === '*';
}

function dottedName(tokens: Tokens, index: number): { parts: string[]; end: number } {
  const parts: string[] = [];
  const positions = [index];
  for (const position of positions) {
    if (isNamePart(tokens[position])) {
      parts.push(textAt(tokens, position));
      positions.push(...(tokens[position + 1]?.text === '.' ? [position + 2] : []));
    }
  }
  const last = positions.at(-1) ?? index;
  return { parts, end: isNamePart(tokens[last]) ? last + 1 : Math.max(index, last - 1) };
}

function importAt(tokens: Tokens, index: number): { entry: ImportEntry; end: number } {
  const isStatic = tokens[index + 1]?.text === 'static';
  const { parts, end } = dottedName(tokens, index + (isStatic ? 2 : 1));
  const aliased = tokens[end]?.text === 'as' && tokens[end + 1]?.kind === 'identifier';
  const wildcard = parts.at(-1) === '*';
  return {
    entry: {
      path: (wildcard ? parts.slice(0, -1) : parts).join('.'),
      wildcard,
      static: isStatic,
      ...(aliased ? { alias: textAt(tokens, end + 1) } : {}),
    },
    end: aliased ? end + 2 : end,
  };
}

function headerStep(tokens: Tokens, header: Header, index: number): number | undefined {
  const text = textAt(tokens, index);
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

function readHeader(tokens: Tokens, close: Int32Array): Header {
  const header: Header = { packageName: '', imports: [], end: 0 };
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

function firstAt(
  tokens: Tokens,
  close: Int32Array,
  { from, to, texts }: Range & { texts: ReadonlySet<string> },
): number {
  return (
    topLevelIndexes(close, { from, to }).find((index) => texts.has(textAt(tokens, index))) ?? -1
  );
}

function lastIdentifierBefore(tokens: Tokens, from: number, to: number): number {
  const found = tokens.slice(from, to).findLastIndex(({ kind }) => kind === 'identifier');
  return found === -1 ? -1 : from + found;
}

function bodyOf(tokens: Tokens, close: Int32Array, { start, end }: Member): Range | undefined {
  const open = firstAt(tokens, close, { from: start, to: end, texts: BODY_OPENERS });
  return open === -1 ? undefined : { from: open + 1, to: Math.max(open + 1, close[open] ?? -1) };
}

function modifiersOf(
  tokens: Tokens,
  from: number,
  isModifier: (text: string) => boolean,
): { modifiers: Set<string>; index: number } {
  const window = tokens.slice(from, from + MAX_MODIFIERS);
  const count = window.findIndex(({ text }) => !isModifier(text));
  const index = from + (count === -1 ? window.length : count);
  return { modifiers: new Set(tokens.slice(from, index).map(({ text }) => text)), index };
}

function isLiteral(tokens: Tokens): boolean {
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

function initializer(tokens: Tokens, close: Int32Array, { from, to }: Range): Token[] {
  const assign = firstAt(tokens, close, { from, to, texts: ASSIGNMENT });
  const end = tokens[to - 1]?.text === ';' ? to - 1 : to;
  return assign === -1 ? [] : tokens.slice(assign + 1, end);
}

function javaModifiers(
  tokens: Tokens,
  close: Int32Array,
  from: number,
): { modifiers: Set<string>; index: number } {
  const modifiers = new Set<string>();
  const positions = [from];
  for (const index of positions) {
    const text = textAt(tokens, index);
    if (text === '@' && tokens[index + 1]?.text !== INTERFACE) {
      positions.push(annotationsEnd(tokens, close, index));
    } else if (JAVA_MODIFIERS.has(text)) {
      modifiers.add(text);
      positions.push(index + 1);
    }
  }
  return { modifiers, index: positions.at(-1) ?? from };
}

function declaresSeveral(tokens: Tokens, close: Int32Array, range: Range): boolean {
  let depth = 0;
  let assigned = false;
  for (const index of topLevelIndexes(close, range)) {
    const text = textAt(tokens, index);
    depth += assigned ? 0 : (ANGLE_DEPTH.get(text) ?? 0);
    assigned = assigned || text === '=';
    if (text === ',' && depth === 0) {
      return true;
    }
  }
  return false;
}

function javaMember(tokens: Tokens, close: Int32Array, member: Member): MemberInfo {
  const { modifiers, index } = javaModifiers(tokens, close, member.start);
  const text = textAt(tokens, index);
  if (text === '@' && tokens[index + 1]?.text === INTERFACE) {
    return { modifiers, kind: 'type', name: tokens[index + 2]?.text, type: true };
  }
  if (JAVA_TYPES.has(text)) {
    return { modifiers, kind: JAVA_TYPES.get(text), name: tokens[index + 1]?.text, type: true };
  }
  const mark = firstAt(tokens, close, { from: index, to: member.end, texts: JAVA_MEMBER_MARKS });
  if (mark !== -1 && textAt(tokens, mark) === '(') {
    return { modifiers, kind: 'function', name: tokens[mark - 1]?.text, paren: mark, from: index };
  }
  const nameIndex = lastIdentifierBefore(tokens, index, mark === -1 ? member.end : mark);
  const kind = declaresSeveral(tokens, close, { from: index, to: member.end }) ? 'fields' : 'field';
  return { modifiers, kind, name: tokens[nameIndex]?.text };
}

function kotlinFunction(tokens: Tokens, close: Int32Array, range: Range): Found | undefined {
  const stops = topLevelIndexes(close, range).filter((index) =>
    FUNCTION_MARKS.has(textAt(tokens, index)),
  );
  const paren = stops.find(
    (index) =>
      textAt(tokens, index) === '(' &&
      tokens[index - 1]?.kind === 'identifier' &&
      textAt(tokens, index - 1) !== 'fun',
  );
  const stop = stops.find((index) => textAt(tokens, index) !== '(');
  return paren === undefined || (stop !== undefined && stop < paren)
    ? undefined
    : { kind: 'function', name: textAt(tokens, paren - 1), paren };
}

function kotlinProperty(tokens: Tokens, close: Int32Array, { from, to }: Range): Found | undefined {
  if (tokens[from]?.text === '(') {
    return undefined;
  }
  const mark = firstAt(tokens, close, { from, to, texts: PROPERTY_MARKS });
  const nameIndex = lastIdentifierBefore(tokens, from, mark === -1 ? to : mark);
  return nameIndex === -1 ? undefined : { kind: 'field', name: textAt(tokens, nameIndex) };
}

function kotlinTypeKind(modifiers: ReadonlySet<string>, keyword: string): string | undefined {
  const marked = TYPE_MODIFIERS.find((modifier) => modifiers.has(modifier));
  return marked === undefined ? KOTLIN_TYPES.get(keyword) : TYPE_MODIFIER_KINDS.get(marked);
}

function kotlinType(
  modifiers: ReadonlySet<string>,
  keyword: string,
  nameToken: Token | undefined,
): { kind: string | undefined; name: string | undefined; type: true } {
  const named =
    nameToken !== undefined && nameToken.kind === 'identifier' && !isKotlinModifier(nameToken.text);
  const companion = modifiers.has('companion') ? 'Companion' : undefined;
  return {
    kind: kotlinTypeKind(modifiers, keyword),
    name: named ? nameToken.text : companion,
    type: true,
  };
}

function kotlinMember(tokens: Tokens, close: Int32Array, member: Member): MemberInfo | undefined {
  const start = annotationsEnd(tokens, close, member.start);
  const { modifiers, index } = modifiersOf(tokens, start, isKotlinModifier);
  const keyword = textAt(tokens, index);
  const range = { from: index + 1, to: member.end };
  if (keyword === 'fun' && tokens[index + 1]?.text === INTERFACE) {
    return { modifiers, kind: INTERFACE, name: tokens[index + 2]?.text, type: true };
  }
  if (KOTLIN_TYPES.has(keyword)) {
    return { modifiers, keyword, ...kotlinType(modifiers, keyword, tokens[index + 1]) };
  }
  const found = KOTLIN_MEMBER_READERS.get(keyword)?.(tokens, close, range);
  return found === undefined ? undefined : { modifiers, ...found, from: index };
}

function kotlinVariable(tokens: Tokens, close: Int32Array, range: Range): Found | undefined {
  const found = kotlinProperty(tokens, close, range);
  return found === undefined ? undefined : { ...found, kind: 'variable' };
}

const KOTLIN_MEMBER_READERS = new Map<string, MemberReader>([
  ['fun', kotlinFunction],
  ['val', kotlinProperty],
  ['var', kotlinVariable],
]);

export const LANGUAGE_RULES: Readonly<Record<'java' | 'kotlin', LanguageRules>> = {
  java: { members: javaMembers, member: javaMember },
  kotlin: { members: kotlinMembers, member: kotlinMember },
};

export function parseStructure(source: string, { kotlin }: { kotlin: boolean }): Structure {
  const tokens = tokenizeJvm(source, { kotlin });
  const close = bracketPairs(tokens);
  return { tokens, close, header: readHeader(tokens, close) };
}

export { bodyOf, initializer, isLiteral };
