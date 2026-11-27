import { kindAt, partnerAt, textAt } from './own-regions.mts';
import type { SourceFile } from '../max-value-sums/sum-types.mts';

const NOT_TYPES = new Set([
  'return',
  'throw',
  'new',
  'else',
  'case',
  'yield',
  'assert',
  'break',
  'continue',
  'instanceof',
  'import',
  'package',
  'extends',
  'implements',
  'throws',
  'default',
  'do',
  'this',
  'super',
  'true',
  'false',
  'null',
  'goto',
  'class',
]);
const DECLARATION_ENDS = new Set(['=', ';', ',', ':', ')', '->', '&&', '||', '?']);
const IN_GENERIC = new Set(['.', ',', '?', '&', '[', ']', '@', 'extends', 'super']);
const BEFORE_LAMBDA = new Set(['(', ',', '=', 'return', '?', ':', '->', '{']);
const GROUP_STARTS = new Set(['(', ',']);
const ANGLE_DEPTH = new Map([
  ['>', 1],
  ['<', -1],
]);

export type DeclaredName = { readonly name: string; readonly index: number };

function isName(source: SourceFile, index: number): boolean {
  return kindAt(source, index) === 'identifier' && !NOT_TYPES.has(textAt(source, index));
}

function inGeneric(source: SourceFile, index: number): boolean {
  const text = textAt(source, index);
  return ANGLE_DEPTH.has(text) || IN_GENERIC.has(text) || isName(source, index);
}

function genericStart(source: SourceFile, last: number): number | undefined {
  let depth = 0;
  const steps = [last];
  for (const index of steps) {
    if (index < 0 || !inGeneric(source, index)) {
      return undefined;
    }
    const text = textAt(source, index);
    depth += ANGLE_DEPTH.get(text) ?? 0;
    if (text === '<' && depth === 0) {
      return index;
    }
    steps.push(index - 1);
  }
  return undefined;
}

function arrayMarkWidth(source: SourceFile, at: number): number {
  const text = textAt(source, at);
  if (text === ']' && textAt(source, at - 1) === '[') {
    return 2;
  }
  return text === '...' ? 1 : 0;
}

function withoutArrayMarks(source: SourceFile, index: number): number {
  const steps = [index];
  let last = index;
  for (const at of steps) {
    const width = arrayMarkWidth(source, at);
    if (width > 0) {
      last = at - width;
      steps.push(last);
    }
  }
  return last;
}

function endsType(source: SourceFile, index: number): boolean {
  const end = withoutArrayMarks(source, index);
  if (textAt(source, end) === '>') {
    const start = genericStart(source, end);
    return start !== undefined && isName(source, start - 1);
  }
  return isName(source, end) && textAt(source, end - 1) !== '@';
}

function listStart(source: SourceFile, from: number): number {
  const steps = [from];
  let last = from;
  for (const at of steps) {
    if (textAt(source, at) === ',' && isName(source, at - 1)) {
      last = at - 2;
      steps.push(last);
    }
  }
  return last;
}

export function inCaseLabel(source: SourceFile, index: number): boolean {
  return textAt(source, listStart(source, index - 1)) === 'case';
}

function groupedLambdaParam(source: SourceFile, index: number): boolean {
  const open = listStart(source, index - 1);
  return (
    textAt(source, open) === '(' &&
    textAt(source, partnerAt(source, open) + 1) === '->' &&
    !isName(source, open - 1) &&
    textAt(source, open - 1) !== '>'
  );
}

function untypedLambdaParam(source: SourceFile, index: number): boolean {
  const before = textAt(source, index - 1);
  if (textAt(source, index + 1) === '->') {
    return BEFORE_LAMBDA.has(before) && !inCaseLabel(source, index);
  }
  return (
    GROUP_STARTS.has(before) &&
    [',', ')'].includes(textAt(source, index + 1)) &&
    groupedLambdaParam(source, index)
  );
}

export function declaresAt(source: SourceFile, index: number): boolean {
  if (!isName(source, index) || textAt(source, index - 1) === '.') {
    return false;
  }
  const typed = DECLARATION_ENDS.has(textAt(source, index + 1)) && endsType(source, index - 1);
  return typed || untypedLambdaParam(source, index);
}

export function namesDeclaredIn(source: SourceFile, indexes: readonly number[]): DeclaredName[] {
  return indexes
    .filter((index) => declaresAt(source, index))
    .map((index) => ({ name: textAt(source, index), index }));
}
