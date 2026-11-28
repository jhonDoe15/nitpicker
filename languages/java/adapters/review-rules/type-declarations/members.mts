import { between, forward, splitTopLevel } from '../max-value-sums/source/source-file.mts';
import type { Token } from '../../reuse/jvm-reuse-types.mts';
import type { BareSource, Span } from '../max-value-sums/sum-types.mts';
import { MODIFIERS, fieldsOf } from './member-fields.mts';
import type { FieldDecl, MethodDecl, TypeKind } from './types.mts';

const CLASS = 'class';
const INTERFACE = 'interface';
const RECORD = 'record';
const SYNCHRONIZED = 'synchronized';
const RETURN = 'return';
const CALL_OFFSET = 3;
const TYPE_KINDS = new Map<string, TypeKind>([
  [CLASS, CLASS],
  [INTERFACE, INTERFACE],
  ['enum', 'enum'],
  [RECORD, RECORD],
]);

export type Member =
  | { readonly kind: 'method'; readonly method: MethodDecl; readonly end: number }
  | { readonly kind: 'field'; readonly fields: readonly FieldDecl[]; readonly end: number }
  | {
      readonly kind: 'type';
      readonly typeKind: TypeKind;
      readonly keyword: number;
      readonly body: Span;
      readonly end: number;
    }
  | { readonly kind: 'other'; readonly end: number };

export function textAt(tokens: readonly Token[], index: number): string {
  return tokens[index]?.text ?? '';
}

function annotationEnd(source: BareSource, at: number): number | undefined {
  const { tokens, partner } = source;
  if (textAt(tokens, at) !== '@' || textAt(tokens, at + 1) === INTERFACE) {
    return undefined;
  }
  const nameEnd =
    between(at + 2, tokens.length).find((k) => (k - at) % 2 === 0 && textAt(tokens, k) !== '.') ??
    tokens.length;
  return textAt(tokens, nameEnd) === '(' ? (partner[nameEnd] ?? nameEnd) + 1 : nameEnd;
}

function skipAnnotations(source: BareSource, from: number): number {
  const steps = [from];
  for (const at of steps) {
    const next = annotationEnd(source, at);
    if (next === undefined) {
      return at;
    }
    steps.push(next);
  }
  return from;
}

function isTypeKeyword(tokens: readonly Token[], index: number): boolean {
  const text = textAt(tokens, index);
  if (
    !TYPE_KINDS.has(text) ||
    textAt(tokens, index - 1) === '.' ||
    tokens[index + 1]?.kind !== 'identifier'
  ) {
    return false;
  }
  return text !== RECORD || ['(', '<'].includes(textAt(tokens, index + 2));
}

function unwrapped(source: BareSource, body: Span): Span {
  const { tokens, partner } = source;
  const open = body.from + 1;
  const block = (partner[open] ?? 0) + 1;
  const guarded =
    textAt(tokens, body.from) === SYNCHRONIZED &&
    textAt(tokens, open) === '(' &&
    textAt(tokens, block) === '{' &&
    (partner[block] ?? 0) === body.to - 1;
  return guarded ? { from: block + 1, to: body.to - 1 } : body;
}

function forwardTarget(
  source: BareSource,
  { name, params, body: whole }: { name: string; params: readonly string[]; body: Span },
): string | undefined {
  const { tokens, partner } = source;
  const body = unwrapped(source, whole);
  const texts = tokens.slice(body.from, body.to).map(({ text }) => text);
  const skipped = texts[0] === RETURN ? 1 : 0;
  const start = skipped + (texts[skipped] === 'this' ? 2 : 0);
  const open = body.from + start + CALL_OFFSET;
  const args = splitTopLevel(source, { from: open + 1, to: partner[open] ?? open });
  const forwarded =
    texts[start + 1] === '.' &&
    texts[start + 2] === name &&
    textAt(tokens, open) === '(' &&
    (partner[open] ?? -1) === body.to - 2 &&
    textAt(tokens, body.to - 1) === ';' &&
    args.length === params.length &&
    args.every(({ from, to }, at) => to === from + 1 && textAt(tokens, from) === params[at]);
  return forwarded ? texts[start] : undefined;
}

const NOT_CALLS = new Set([
  'if',
  'for',
  'while',
  'switch',
  'catch',
  RETURN,
  'throw',
  'super',
  'this',
  'assert',
  'try',
]);

function dependsOnCaller(
  tokens: readonly Token[],
  { body, params }: { body: Span; params: readonly string[] },
): boolean {
  for (const at of between(body.from, body.to)) {
    const token = tokens[at];
    if (token?.text === 'this' || token?.text === 'super' || params.includes(token?.text ?? '')) {
      return true;
    }
    const before = textAt(tokens, at - 1);
    const direct = before !== '.' && before !== 'new' && before !== '::';
    if (
      token?.kind === 'identifier' &&
      textAt(tokens, at + 1) === '(' &&
      !NOT_CALLS.has(token.text) &&
      direct
    ) {
      return true;
    }
  }
  return false;
}

function firstTop(source: BareSource, from: number, stops: readonly string[]): number {
  for (const { index } of forward(source, from)) {
    if (stops.includes(textAt(source.tokens, index))) {
      return index;
    }
  }
  return source.tokens.length;
}

function typeNameOf(tokens: readonly Token[], span: Span, names: readonly Token[]): string {
  const shaped = tokens.slice(span.from, span.to).some(({ text }) => text === '<' || text === '[');
  return shaped || names.length < 2 ? '?' : (names.toReversed()[1]?.text ?? '?');
}

function methodOf(source: BareSource, { from, open }: { from: number; open: number }): MethodDecl {
  const { tokens, partner } = source;
  const parts = splitTopLevel(source, { from: open + 1, to: partner[open] ?? open }).filter(
    ({ from: start, to }) =>
      tokens.slice(start, to).filter(({ kind }) => kind === 'identifier').length >= 2,
  );
  const segments = parts
    .map(({ from: start, to }) =>
      tokens.slice(start, to).filter(({ kind }) => kind === 'identifier'),
    )
    .filter((names) => names.length >= 2);
  const params = segments.map((names) => names.at(-1)?.text ?? '');
  const paramTypes = parts.map((part, at) => typeNameOf(tokens, part, segments[at] ?? []));
  const after = firstTop(source, (partner[open] ?? open) + 1, ['{', ';']);
  const body: Span | undefined =
    textAt(tokens, after) === '{' ? { from: after + 1, to: partner[after] ?? after } : undefined;
  const name = textAt(tokens, open - 1);
  return {
    name,
    params,
    paramTypes,
    selfContained: body !== undefined && !dependsOnCaller(tokens, { body, params }),
    forwardsTo: body === undefined ? undefined : forwardTarget(source, { name, params, body }),
    modifiers: new Set(
      tokens.slice(from, open - 1).flatMap(({ text }) => (MODIFIERS.has(text) ? [text] : [])),
    ),
  };
}

function typeMember(source: BareSource, keyword: number): Member {
  const { tokens, partner } = source;
  const open = firstTop(source, keyword, ['{']);
  const close = partner[open] ?? open;
  const typeKind = TYPE_KINDS.get(textAt(tokens, keyword)) ?? CLASS;
  return { kind: 'type', typeKind, keyword, body: { from: open + 1, to: close }, end: close + 1 };
}

function scanHeader(
  source: BareSource,
  start: number,
): { end: number; paren: number; type: Member | undefined } {
  const { tokens } = source;
  let paren = -1;
  let assigned = false;
  for (const { index } of forward(source, start)) {
    const text = textAt(tokens, index);
    if (text === ';' || (text === '{' && !assigned)) {
      return { end: index, paren, type: undefined };
    }
    if (!assigned && isTypeKeyword(tokens, index)) {
      return { end: index, paren, type: typeMember(source, index) };
    }
    assigned = assigned || text === '=';
    paren = text === '(' && paren === -1 && !assigned ? index : paren;
  }
  return { end: tokens.length, paren, type: undefined };
}

export function memberAt(source: BareSource, from: number): Member {
  const { tokens, partner } = source;
  const start = skipAnnotations(source, from);
  const { end: index, paren, type } = scanHeader(source, start);
  if (type !== undefined) {
    return type;
  }
  const bodyEnd = textAt(tokens, index) === '{' ? (partner[index] ?? index) + 1 : index + 1;
  if (paren > start) {
    return { kind: 'method', method: methodOf(source, { from: start, open: paren }), end: bodyEnd };
  }
  const generated = tokens.slice(from, start).some(({ text }) => text === 'Delegate');
  const fields =
    paren === -1 && index > start ? fieldsOf(source, { from: start, end: index, generated }) : [];
  return fields.length === 0
    ? { kind: 'other', end: bodyEnd }
    : { kind: 'field', fields, end: bodyEnd };
}
