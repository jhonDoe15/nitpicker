import { isTrivialValue as untypedIsTrivialValue } from '../../../../../shared/rules/copied-constants/copied-constants.mjs';
import type { Parsed, Token } from '../../reuse/jvm-reuse-types.mts';
import type { Literal, TestLiteral } from './constant-types.mts';
import { tokenValue } from './jvm-values.mts';

const isTrivialValue: (value: Literal) => boolean = untypedIsTrivialValue;

const STATEMENT_ENDS = new Set([';', '{', '}']);
const VALUE_BEFORE = new Set(['identifier', 'number', 'string', 'char']);
const CLOSES_VALUE = new Set([')', ']']);
const CONTINUES_AFTER = new Set([
  '(',
  '[',
  ',',
  '=',
  '.',
  '?.',
  '::',
  '->',
  '+',
  '-',
  '*',
  '/',
  '%',
  '&&',
  '||',
  '?:',
  '==',
  '!=',
  '<',
  '>',
  '<=',
  '>=',
]);
const CONTINUES_BEFORE = new Set(['.', '?.', '?:', '&&', '||', ')', ']']);
const TEST_NAME_CALLS = new Set([
  'test',
  'it',
  'xit',
  'fit',
  'xtest',
  'describe',
  'xdescribe',
  'fdescribe',
  'context',
  'xcontext',
  'should',
  'xshould',
  'given',
  'and',
  'feature',
  'scenario',
  'dynamicTest',
  'dynamicContainer',
]);

const STATEMENT_WINDOW = 400;
const ANNOTATION_WINDOW = 4000;
const NAME_WINDOW = 64;
const DEPTH_STEP = new Map<string, number>([
  ['(', 1],
  ['[', 1],
  [')', -1],
  [']', -1],
]);

function indexes(from: number, to: number): number[] {
  return Array.from({ length: Math.max(0, to - from) }, (_, offset) => from + offset);
}

function isAnnotationName(token: Token | undefined): boolean {
  return token?.kind === 'identifier' || token?.text === '.' || token?.text === ':';
}

function closingParen(tokens: readonly Token[], open: number): number {
  let depth = 0;
  for (const at of indexes(open, Math.min(tokens.length, open + ANNOTATION_WINDOW))) {
    depth += DEPTH_STEP.get(tokens[at]?.text ?? '') ?? 0;
    if (depth === 0) {
      return at;
    }
  }
  return Math.min(tokens.length, open + ANNOTATION_WINDOW) - 1;
}

function annotationEnd(tokens: readonly Token[], at: number): number {
  const name = indexes(at + 1, Math.min(tokens.length, at + 1 + NAME_WINDOW)).find(
    (index) => !isAnnotationName(tokens[index]),
  );
  return name !== undefined && tokens[name]?.text === '(' ? closingParen(tokens, name) : at;
}

function annotationRanges(tokens: readonly Token[]): Set<number> {
  return new Set(
    [...tokens.entries()].flatMap(([index, token]) => {
      const isAnnotation = token.text === '@' && tokens[index - 1]?.kind !== 'identifier';
      return isAnnotation ? indexes(index, annotationEnd(tokens, index) + 1) : [];
    }),
  );
}

function isTestName(tokens: readonly Token[], index: number, kotlin: boolean): boolean {
  const before = tokens[index - 1];
  const after = tokens[index + 1];
  const isFirstArgument =
    before?.text === '(' && TEST_NAME_CALLS.has(tokens[index - 2]?.text ?? '');
  const isSpecName =
    kotlin &&
    (after?.text === '{' ||
      (after?.text === '-' && tokens[index + 2]?.text === '{') ||
      (after?.kind === 'identifier' && tokens[index + 2]?.text === '{'));
  return isFirstArgument || isSpecName;
}

function isNegation(tokens: readonly Token[], index: number): boolean {
  const sign = tokens[index - 1];
  const before = tokens[index - 2];
  return (
    sign?.text === '-' &&
    !(before !== undefined && (VALUE_BEFORE.has(before.kind) || CLOSES_VALUE.has(before.text)))
  );
}

function breaksLine(earlier: Token, later: Token, kotlin: boolean): boolean {
  return (
    kotlin &&
    earlier.line < later.line &&
    !CONTINUES_AFTER.has(earlier.text) &&
    !CONTINUES_BEFORE.has(later.text)
  );
}

function isBoundary(
  token: Token | undefined,
  neighbour: Token | undefined,
  { kotlin, backward }: { kotlin: boolean; backward: boolean },
): boolean {
  if (token === undefined || neighbour === undefined) {
    return false;
  }
  if (STATEMENT_ENDS.has(token.text)) {
    return true;
  }
  return backward ? breaksLine(token, neighbour, kotlin) : breaksLine(neighbour, token, kotlin);
}

function statementStart(tokens: readonly Token[], index: number, kotlin: boolean): number {
  const from = Math.max(0, index - STATEMENT_WINDOW);
  let depth = 0;
  for (const at of indexes(from, index).toReversed()) {
    if (depth === 0 && isBoundary(tokens[at], tokens[at + 1], { kotlin, backward: true })) {
      return at + 1;
    }
    depth = Math.max(0, depth - (DEPTH_STEP.get(tokens[at]?.text ?? '') ?? 0));
  }
  return from;
}

function statementEnd(tokens: readonly Token[], index: number, kotlin: boolean): number {
  const to = Math.min(tokens.length, index + STATEMENT_WINDOW);
  let depth = 0;
  for (const at of indexes(index + 1, to)) {
    if (depth === 0 && isBoundary(tokens[at], tokens[at - 1], { kotlin, backward: false })) {
      return at;
    }
    depth = Math.max(0, depth + (DEPTH_STEP.get(tokens[at]?.text ?? '') ?? 0));
  }
  return to;
}

function statementNames(tokens: readonly Token[], index: number, kotlin: boolean): Set<string> {
  const statement = tokens.slice(
    statementStart(tokens, index, kotlin),
    statementEnd(tokens, index, kotlin),
  );
  return new Set(statement.filter(({ kind }) => kind === 'identifier').map(({ text }) => text));
}

function literalAt(tokens: readonly Token[], index: number, kotlin: boolean): Literal | undefined {
  const token = tokens[index];
  if (token === undefined || (token.kind !== 'string' && token.kind !== 'number')) {
    return undefined;
  }
  const negated = token.kind === 'number' && isNegation(tokens, index);
  const value = tokenValue(token.text, { negated, kotlin });
  return value === undefined || isTrivialValue(value) ? undefined : value;
}

export function testLiterals(parsed: Parsed, { kotlin }: { kotlin: boolean }): TestLiteral[] {
  const { tokens, headerEnd } = parsed;
  const skipped = annotationRanges(tokens);
  return indexes(headerEnd, tokens.length).flatMap((index) => {
    const value = skipped.has(index) ? undefined : literalAt(tokens, index, kotlin);
    return value === undefined || isTestName(tokens, index, kotlin)
      ? []
      : [
          {
            value,
            line: tokens[index]?.line ?? 0,
            names: () => statementNames(tokens, index, kotlin),
          },
        ];
  });
}
