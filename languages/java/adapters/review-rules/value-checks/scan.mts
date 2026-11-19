import { forward, startsNewLine } from '../max-value-sums/source-file.mts';
import type { BareSource, Frame, SourceFile, Span } from '../max-value-sums/sum-types.mts';

export type ValueFound = {
  readonly line: number;
  readonly name: string;
  readonly method: string;
};

export type ValueCheck<Found extends ValueFound = ValueFound> = {
  readonly rule: string;
  readonly find: (source: SourceFile) => Found[];
  readonly message: (found: Found, kotlin: boolean) => string;
  readonly allowed: string;
};

export type Declaration = { readonly name: string; readonly at: number; readonly end: number };

export function statementStop(source: BareSource, from: number): { index: number; ends: boolean } {
  const { tokens, kotlin } = source;
  for (const { index, group } of forward(source, from)) {
    const text = tokens[index]?.text;
    const ends = kotlin ? index > from && startsNewLine(tokens, index) : text === ';' && !group;
    if (ends || text === '}') {
      return { index, ends };
    }
  }
  return { index: tokens.length, ends: false };
}

export type Branch = Span & { readonly next: number };

export function blockBranch(source: BareSource, start: number): Branch | undefined {
  const { tokens, partner } = source;
  const close = partner[start] ?? -1;
  if (tokens[start]?.text === '{' && close > start) {
    return { from: start + 1, to: close, next: close + 1 };
  }
  return undefined;
}

export function statementEnd(source: BareSource, from: number): number {
  return statementStop(source, from).index;
}

export function declarations(source: BareSource, { from, to }: Span): Declaration[] {
  const { tokens } = source;
  const found: Declaration[] = [];
  for (const [offset, { text, kind }] of tokens.slice(from + 1, to).entries()) {
    const index = from + 1 + offset;
    const before = tokens[index - 1]?.text;
    if (kind === 'identifier' && tokens[index + 1]?.text === '=' && before !== '.') {
      found.push({ name: text, at: index, end: statementEnd(source, index + 2) });
    }
  }
  return found;
}

export function ownUses(source: BareSource, { from, to }: Span, name: string): number[] {
  const { tokens } = source;
  const uses: number[] = [];
  for (const [offset, token] of tokens.slice(from, to).entries()) {
    const index = from + offset;
    const isName = token.text === name && tokens[index - 1]?.text !== '.';
    if (isName && tokens[index + 1]?.text !== '=') {
      uses.push(index);
    }
  }
  return uses;
}

export function textsOf(source: BareSource, from: number, to: number): string[] {
  return source.tokens.slice(from, to).map(({ text }) => text);
}

export function callBefore(source: BareSource, index: number): string | undefined {
  const open = source.opener[index] ?? -1;
  return open >= 0 && source.tokens[open]?.text === '(' ? source.tokens[open - 1]?.text : undefined;
}

export function eachFrame<Found>(
  source: SourceFile,
  visit: (range: Span, frame: Frame) => Found[],
): Found[] {
  return source.frames.flatMap((frame) =>
    visit({ from: frame.body.from, to: frame.body.to }, frame),
  );
}
