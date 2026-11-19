import { splitTopLevel } from '../max-value-sums/source-file.mts';
import type { BareSource, Span } from '../max-value-sums/sum-types.mts';
import type { Token } from '../../reuse/jvm-reuse-types.mts';
import { tokenText } from '../string-calls/calls.mts';

export type TokenCall = {
  readonly name: string;
  readonly index: number;
  readonly open: number;
  readonly close: number;
  readonly line: number;
  readonly receiver: Span | undefined;
  readonly args: Span[];
};

const IDENTIFIER = 'identifier';
const CALL_SEPARATORS = new Set(['.', '?.']);
const QUOTED = /^"([^"\\\n]*)"$/u;

function wordIndex(tokens: readonly Token[], index: number): boolean {
  const kind = tokens[index]?.kind;
  return kind === IDENTIFIER || kind === 'string' || kind === 'number';
}

function receiverStep(source: BareSource, at: number): number | undefined {
  const { tokens, partner } = source;
  const text = tokens[at]?.text;
  const pair = partner[at] ?? -1;
  let start: number | undefined;
  if ((text === ')' || text === ']') && pair >= 0 && pair < at) {
    const named = text === ')' && tokens[pair - 1]?.kind === IDENTIFIER;
    start = named ? pair - 1 : pair;
  } else if (wordIndex(tokens, at)) {
    start = at;
  }
  return start;
}

function receiverStart(source: BareSource, dot: number): number {
  let start = dot;
  const pending = [dot - 1];
  for (const at of pending) {
    const found = at >= 0 ? receiverStep(source, at) : undefined;
    if (found === undefined) {
      break;
    }
    start = found;
    if (CALL_SEPARATORS.has(source.tokens[start - 1]?.text ?? '')) {
      pending.push(start - 2);
    }
  }
  return start;
}

export function methodCalls(source: BareSource): TokenCall[] {
  const { tokens, partner } = source;
  const calls: TokenCall[] = [];
  for (const [index, { text, kind, line }] of tokens.entries()) {
    const open = index + 1;
    const close = partner[open] ?? -1;
    const member = CALL_SEPARATORS.has(tokens[index - 1]?.text ?? '');
    if (kind !== IDENTIFIER || tokens[open]?.text !== '(' || close < 0) {
      continue;
    }
    const dot = index - 1;
    calls.push({
      name: text,
      index,
      open,
      close,
      line,
      receiver: member ? { from: receiverStart(source, dot), to: dot } : undefined,
      args: splitTopLevel(source, { from: open + 1, to: close }),
    });
  }
  return calls;
}

export function textOf(source: BareSource, range: Span): string {
  return tokenText(source, range, '');
}

export function shortText(text: string, limit = 40): string {
  const points = Array.from(text);
  return points.length > limit ? `${points.slice(0, limit).join('')}...` : text;
}

export function stringValue(source: BareSource, range: Span | undefined): string | undefined {
  if (range === undefined || range.to - range.from !== 1) {
    return undefined;
  }
  const token = source.tokens[range.from];
  return token?.kind === 'string' ? QUOTED.exec(token.text)?.[1] : undefined;
}

export function lastName(source: BareSource, { from, to }: Span): string | undefined {
  const { tokens, partner } = source;
  const pending = [to - 1];
  for (const index of pending) {
    if (index < from) {
      break;
    }
    const { kind, text } = tokens[index] ?? { kind: '', text: '' };
    if (kind === IDENTIFIER) {
      return text;
    }
    if (text === ')') {
      pending.push((partner[index] ?? -1) - 1);
    } else if (text === '(') {
      pending.push(index - 1);
    } else {
      return undefined;
    }
  }
  return undefined;
}

export function stringNames(source: BareSource): Set<string> {
  const { tokens } = source;
  const names = new Set<string>();
  for (const [index, { text }] of tokens.entries()) {
    if (text !== 'String') {
      continue;
    }
    const next = tokens[index + 1];
    const label = tokens[index - 1]?.text === ':' ? tokens[index - 2] : undefined;
    if (next?.kind === IDENTIFIER) {
      names.add(next.text);
    } else if (label?.kind === IDENTIFIER) {
      names.add(label.text);
    }
  }
  return names;
}

export function startOfStatement(source: BareSource, from: number): number {
  const { tokens, opener } = source;
  const level = opener[from] ?? -1;
  const lower = level + 1;
  const stop = tokens
    .slice(lower, from)
    .findLastIndex(
      (token, offset) =>
        opener[lower + offset] === level && (token.text === ';' || token.text === '}'),
    );
  return stop === -1 ? lower : lower + stop + 1;
}

export function endOfCondition(source: BareSource, from: number): number {
  const { tokens, opener, partner } = source;
  const level = opener[from] ?? -1;
  const found = tokens
    .slice(from)
    .findIndex(
      (token, offset) =>
        from + offset === partner[level] ||
        (opener[from + offset] === level && (token.text === ';' || token.text === '{')),
    );
  return found === -1 ? tokens.length : from + found;
}
