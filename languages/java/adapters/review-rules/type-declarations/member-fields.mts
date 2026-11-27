import { angleStep, between, forward } from '../max-value-sums/source/source-file.mts';
import type { Token } from '../../reuse/jvm-reuse-types.mts';
import type { BareSource, Span } from '../max-value-sums/sum-types.mts';
import type { FieldDecl } from './types.mts';

export const MODIFIERS: ReadonlySet<string> = new Set([
  'public',
  'protected',
  'private',
  'static',
  'final',
  'abstract',
  'default',
  'synchronized',
  'native',
  'transient',
  'volatile',
  'strictfp',
  'sealed',
]);
const STATEMENT_ENDS = new Set([';', '{', '}']);
const DECLARATOR_ENDS = new Set(['=', ';', ',']);

function textOf(tokens: readonly Token[], index: number): string {
  return tokens
    .slice(index, index + 1)
    .map(({ text }) => text)
    .join('');
}

function stepBack(source: BareSource, before: number): number {
  return textOf(source.tokens, before) === ')' ? Number(source.partner.at(before)) : before;
}

export function statementStart(source: BareSource, index: number): number {
  const steps = [index];
  let last = index;
  for (const at of steps) {
    if (at > 0 && !STATEMENT_ENDS.has(textOf(source.tokens, at - 1))) {
      last = stepBack(source, at - 1);
      steps.push(last);
    }
  }
  return last;
}

function typeName(head: readonly Token[]): string {
  let name = '';
  for (const token of head) {
    if (token.kind !== 'identifier' && token.text !== '.') {
      break;
    }
    name = token.text === '.' ? name : token.text;
  }
  return name;
}

function declaratorEnd(tokens: readonly Token[], span: Span): number {
  let angle = 0;
  for (const at of between(span.from, span.to)) {
    const text = textOf(tokens, at);
    if (angle <= 0 && DECLARATOR_ENDS.has(text)) {
      return at;
    }
    angle += angleStep(text);
  }
  return span.to;
}

function laterDeclarators(source: BareSource, { from, to }: Span): number[] {
  const names: number[] = [];
  let angle = 0;
  for (const { index } of forward(source, from)) {
    if (index >= to) {
      break;
    }
    const text = textOf(source.tokens, index);
    angle = Math.max(0, angle + angleStep(text));
    if (angle === 0 && text === ',' && source.tokens[index + 1]?.kind === 'identifier') {
      names.push(index + 1);
    }
  }
  return names;
}

export function fieldsOf(
  source: BareSource,
  { from, end, generated }: { from: number; end: number; generated: boolean },
): FieldDecl[] {
  const { tokens } = source;
  const stop = declaratorEnd(tokens, { from, to: end });
  const last = stop - 1;
  const declared = tokens.slice(from, last);
  const head = declared.filter(({ text }) => !MODIFIERS.has(text));
  if (tokens[last]?.kind !== 'identifier' || head.length === 0) {
    return [];
  }
  const shared = {
    type: typeName(head),
    generated,
    modifiers: new Set(declared.flatMap(({ text }) => (MODIFIERS.has(text) ? [text] : []))),
    array: declared.some(({ text }) => text === '['),
  };
  return [last, ...laterDeclarators(source, { from: stop, to: end })].map((index) => ({
    ...shared,
    name: textOf(tokens, index),
    index,
  }));
}
