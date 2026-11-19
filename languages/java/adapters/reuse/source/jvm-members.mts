import type { Token } from '../jvm-reuse-types.mts';
import type { Member, Range } from './jvm-source-types.mts';

type Tokens = readonly Token[];

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

export function textAt(tokens: Tokens, index: number): string {
  return tokens[index]?.text ?? '';
}

export function bracketPairs(tokens: Tokens): Int32Array {
  const close = new Int32Array(tokens.length).fill(-1);
  const open: number[] = [];
  for (const [index, { text, kind }] of tokens.entries()) {
    if (kind !== 'operator') {
      continue;
    }
    const top = open.at(-1);
    if (OPENERS.has(text)) {
      open.push(index);
    } else if (
      CLOSERS.has(text) &&
      top !== undefined &&
      OPENERS.get(textAt(tokens, top)) === text
    ) {
      open.pop();
      close[top] = index;
    }
  }
  return close;
}

function skipNested(close: Int32Array, index: number): number {
  const end = close[index];
  return end !== undefined && end > index ? end : index;
}

export function topLevelIndexes(close: Int32Array, { from, to }: Range): number[] {
  const indexes: number[] = [];
  const positions = [from];
  for (const index of positions) {
    if (index < to) {
      indexes.push(index);
      positions.push(skipNested(close, index) + 1);
    }
  }
  return indexes;
}

function isInitializerBrace(
  tokens: Tokens,
  close: Int32Array,
  { start, index }: { start: number; index: number },
): boolean {
  return topLevelIndexes(close, { from: start, to: index }).some((position) =>
    INITIALIZER_MARKS.has(textAt(tokens, position)),
  );
}

function javaMemberEnd(
  tokens: Tokens,
  close: Int32Array,
  { start, index }: { start: number; index: number },
): number | undefined {
  const text = textAt(tokens, index);
  if (text === '{' && !isInitializerBrace(tokens, close, { start, index })) {
    return skipNested(close, index) + 1;
  }
  return text === ';' ? index + 1 : undefined;
}

export function javaMembers(tokens: Tokens, close: Int32Array, range: Range): Member[] {
  const members: Member[] = [];
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

function startsLine(tokens: Tokens, index: number): boolean {
  const previous = tokens[index - 1];
  return (
    previous === undefined ||
    MEMBER_BOUNDARIES.has(previous.text) ||
    (previous.line < (tokens[index]?.line ?? 0) && !CONTINUATIONS.has(previous.text))
  );
}

function declaresAhead(tokens: Tokens, index: number): boolean {
  const ahead = tokens.slice(index, index + MAX_MODIFIERS);
  const keyword = ahead.findIndex(({ text }) => KOTLIN_KEYWORDS.has(text));
  return keyword !== -1 && ahead.slice(0, keyword).every(({ text }) => KOTLIN_MODIFIERS.has(text));
}

function startsKotlinMember(
  tokens: Tokens,
  { index, from }: { index: number; from: number },
): boolean {
  const text = textAt(tokens, index);
  if (index !== from && !startsLine(tokens, index)) {
    return false;
  }
  return text === '@' || KOTLIN_KEYWORDS.has(text) || declaresAhead(tokens, index);
}

function trimmedEnd(tokens: Tokens, start: number, end: number): number {
  const kept = tokens.slice(start + 1, end).findLastIndex(({ text }) => text !== ';');
  return start + 2 + kept;
}

export function kotlinMembers(tokens: Tokens, close: Int32Array, range: Range): Member[] {
  const starts: number[] = [];
  let declared = true;
  for (const index of topLevelIndexes(close, range)) {
    const text = textAt(tokens, index);
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

function nameEnd(tokens: Tokens, from: number): number {
  const positions = [from];
  for (const index of positions) {
    if (NAME_SEPARATORS.has(textAt(tokens, index))) {
      positions.push(index + 2);
    }
  }
  return positions.at(-1) ?? from;
}

function annotationEnd(tokens: Tokens, close: Int32Array, at: number): number {
  const name = nameEnd(tokens, tokens[at + 1]?.text === '[' ? at + 1 : at + 2);
  return ARGUMENT_OPENERS.has(textAt(tokens, name)) ? skipNested(close, name) + 1 : name;
}

function startsAnnotation(tokens: Tokens, index: number): boolean {
  return tokens[index]?.text === '@' && tokens[index + 1]?.text !== 'interface';
}

export function annotationsEnd(tokens: Tokens, close: Int32Array, from: number): number {
  const positions = [from];
  for (const index of positions) {
    if (startsAnnotation(tokens, index)) {
      positions.push(annotationEnd(tokens, close, index));
    }
  }
  return positions.at(-1) ?? from;
}

export function isKotlinModifier(text: string): boolean {
  return KOTLIN_MODIFIERS.has(text);
}
