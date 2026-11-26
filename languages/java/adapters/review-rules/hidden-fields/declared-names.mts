import { textAt } from './own-regions.mts';
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

export type DeclaredName = { readonly name: string; readonly index: number };

function isName(source: SourceFile, index: number): boolean {
  return source.tokens[index]?.kind === 'identifier' && !NOT_TYPES.has(textAt(source, index));
}

function genericStart(source: SourceFile, last: number): number | undefined {
  let depth = 0;
  const steps = [last];
  for (const index of steps) {
    const text = textAt(source, index);
    depth += (text === '>' ? 1 : 0) - (text === '<' ? 1 : 0);
    if (text === '<' && depth === 0) {
      return index;
    }
    const allowed = text === '<' || text === '>' || IN_GENERIC.has(text) || isName(source, index);
    if (allowed && index > 0) {
      steps.push(index - 1);
    }
  }
  return undefined;
}

function lastStep(steps: readonly number[], first: number): number {
  return steps.at(-1) ?? first;
}

function withoutArrayMarks(source: SourceFile, index: number): number {
  const steps = [index];
  for (const at of steps) {
    const text = textAt(source, at);
    if (text === ']' && textAt(source, at - 1) === '[') {
      steps.push(at - 2);
    } else if (text === '...') {
      steps.push(at - 1);
    }
  }
  return lastStep(steps, index);
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
  for (const at of steps) {
    if (textAt(source, at) === ',' && isName(source, at - 1)) {
      steps.push(at - 2);
    }
  }
  return lastStep(steps, from);
}

export function inCaseLabel(source: SourceFile, index: number): boolean {
  return textAt(source, listStart(source, index - 1)) === 'case';
}

function untypedLambdaParam(source: SourceFile, index: number): boolean {
  const before = textAt(source, index - 1);
  if (textAt(source, index + 1) === '->') {
    return BEFORE_LAMBDA.has(before) && !inCaseLabel(source, index);
  }
  if (!(GROUP_STARTS.has(before) && [',', ')'].includes(textAt(source, index + 1)))) {
    return false;
  }
  const open = listStart(source, index - 1);
  const close = source.partner[open] ?? -1;
  return (
    textAt(source, open) === '(' &&
    textAt(source, close + 1) === '->' &&
    !isName(source, open - 1) &&
    textAt(source, open - 1) !== '>'
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
