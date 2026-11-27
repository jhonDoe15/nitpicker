import { forward } from '../max-value-sums/source/source-file.mts';
import { statementStart } from '../type-declarations/member-fields.mts';
import type { Frame, SourceFile, Span } from '../max-value-sums/sum-types.mts';

const TYPE_WORDS = new Set(['class', 'interface', 'enum', 'record']);
const IN_CREATION = new Set(['.', '<', '>', ',', '?']);

export type OwnFrame = {
  readonly frame: Frame;
  readonly constructor: boolean;
  readonly isStatic: boolean;
};

export type OwnRegions = {
  readonly body: Span;
  readonly nested: readonly Span[];
  readonly frames: readonly OwnFrame[];
};

export function textAt(source: SourceFile, index: number): string {
  return source.tokens[index]?.text ?? '';
}

export function kindAt(source: SourceFile, index: number): string {
  return source.tokens[index]?.kind ?? '';
}

export function lineAt(source: SourceFile, index: number, fallback: number): number {
  return source.tokens[index]?.line ?? fallback;
}

export function partnerAt(source: SourceFile, index: number): number {
  return source.partner[index] ?? -1;
}

export function openerAt(source: SourceFile, index: number): number {
  return source.opener[index] ?? -1;
}

export function inside(spans: readonly Span[], index: number): boolean {
  return spans.some(({ from, to }) => index >= from && index < to);
}

function blockAfter(source: SourceFile, from: number): Span | undefined {
  for (const { index } of forward(source, from)) {
    const text = textAt(source, index);
    if (text === '{') {
      return { from: index + 1, to: partnerAt(source, index) };
    }
    if (text === ';' || text === '}') {
      return undefined;
    }
  }
  return undefined;
}

function typeBodyAt(source: SourceFile, index: number): Span | undefined {
  const typed =
    TYPE_WORDS.has(textAt(source, index)) &&
    textAt(source, index - 1) !== '.' &&
    kindAt(source, index + 1) === 'identifier' &&
    (textAt(source, index) !== 'record' || ['(', '<'].includes(textAt(source, index + 2)));
  return typed ? blockAfter(source, index + 2) : undefined;
}

function creationOpen(source: SourceFile, index: number): number | undefined {
  for (const { index: at, end } of forward(source, index + 1)) {
    const text = textAt(source, at);
    if (text === '(') {
      return end;
    }
    if (kindAt(source, at) !== 'identifier' && !IN_CREATION.has(text)) {
      return undefined;
    }
  }
  return undefined;
}

function anonymousBodyAt(source: SourceFile, index: number): Span | undefined {
  const end = textAt(source, index) === 'new' ? creationOpen(source, index) : undefined;
  return end !== undefined && textAt(source, end) === '{'
    ? { from: end + 1, to: partnerAt(source, end) }
    : undefined;
}

function nestedBodies(source: SourceFile, body: Span): Span[] {
  const spans: Span[] = [];
  const positions = [body.from];
  for (const index of positions) {
    const span =
      index < body.to ? (typeBodyAt(source, index) ?? anonymousBodyAt(source, index)) : undefined;
    if (span !== undefined) {
      spans.push(span);
    }
    if (index < body.to) {
      positions.push(span === undefined ? index + 1 : span.to + 1);
    }
  }
  return spans;
}

function isStaticFrame(source: SourceFile, frame: Frame): boolean {
  const start = statementStart(source, frame.open - 1);
  return source.tokens.slice(start, frame.open - 1).some(({ text }) => text === 'static');
}

export function ownRegions(source: SourceFile, body: Span, typeName: string): OwnRegions {
  const nested = nestedBodies(source, body);
  const frames = source.frames
    .filter(({ open, body: frameBody }) => open > body.from && frameBody.to <= body.to)
    .filter(({ open }) => !inside(nested, open))
    .map((frame) => ({
      frame,
      constructor: frame.name === typeName,
      isStatic: isStaticFrame(source, frame),
    }));
  return { body, nested, frames };
}

export function frameSpan({ open, body }: Frame): Span {
  return { from: open + 1, to: body.to };
}

export function ownIndexes(regions: OwnRegions, span: Span): number[] {
  const kept: number[] = [];
  const positions = [span.from];
  for (const index of positions) {
    if (index < span.to) {
      const skipped = regions.nested.find(({ from, to }) => index >= from && index < to);
      kept.push(...(skipped === undefined ? [index] : []));
      positions.push(skipped === undefined ? index + 1 : skipped.to);
    }
  }
  return kept;
}
