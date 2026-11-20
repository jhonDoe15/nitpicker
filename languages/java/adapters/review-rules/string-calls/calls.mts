import { splitTopLevel } from '../max-value-sums/source/source-file.mts';
import type { BareSource, Span } from '../max-value-sums/sum-types.mts';
import type { Token } from '../../reuse/jvm-reuse-types.mts';

export type MethodCall = {
  readonly name: string;
  readonly dot: number;
  readonly open: number;
  readonly close: number;
  readonly line: number;
  readonly args: Span[];
};

type ReceiverStep = { readonly start: number; readonly next: number };

const UNICODE_ESCAPE_LENGTH = 5;
const ESCAPES: Readonly<Record<string, string>> = {
  n: '\n',
  t: '\t',
  r: '\r',
  b: '\b',
  f: '\f',
  0: '\0',
};

export function stringValue(token: Token | undefined): string | undefined {
  if (token?.kind !== 'string' || token.text.startsWith('"""')) {
    return undefined;
  }
  const body = token.text.slice(1, -1);
  if ((token.names?.length ?? 0) > 0) {
    return undefined;
  }
  return body.replaceAll(/\\(u[\da-fA-F]{4}|.)/gu, (_match, code: string) =>
    code.length === UNICODE_ESCAPE_LENGTH
      ? String.fromCharCode(Number.parseInt(code.slice(1), 16))
      : (ESCAPES[code] ?? code),
  );
}

export function isOperator(token: Token | undefined, texts: readonly string[]): boolean {
  return token?.kind === 'operator' && texts.includes(token.text);
}

export function methodCalls(source: BareSource, names: readonly string[]): MethodCall[] {
  const { tokens, partner } = source;
  const found: MethodCall[] = [];
  for (const [index, token] of tokens.entries()) {
    const dot = tokens[index - 1];
    const wanted = token.kind === 'identifier' && names.includes(token.text);
    if (!wanted || !isOperator(dot, ['.', '?.']) || tokens[index + 1]?.text !== '(') {
      continue;
    }
    const close = partner[index + 1] ?? -1;
    if (close > index) {
      found.push({
        name: token.text,
        dot: index - 1,
        open: index + 1,
        close,
        line: token.line,
        args: splitTopLevel(source, { from: index + 2, to: close }),
      });
    }
  }
  return found;
}

function receiverStep(source: BareSource, index: number): ReceiverStep | undefined {
  const { tokens, partner } = source;
  const token = tokens[index];
  const pair = partner[index] ?? -1;
  if (isOperator(token, [')', ']']) && pair >= 0 && pair < index) {
    return { start: pair, next: pair - 1 };
  }
  if (
    token === undefined ||
    !['identifier', 'string', 'number'].includes(token.kind) ||
    token.text === 'return'
  ) {
    return undefined;
  }
  const chained = isOperator(tokens[index - 1], ['.', '?.']);
  return { start: index, next: chained ? index - 2 : -1 };
}

export function receiverStart(source: BareSource, dot: number): number {
  let start = dot;
  const pending = [dot - 1];
  for (const index of pending) {
    const step = index >= 0 ? receiverStep(source, index) : undefined;
    if (step === undefined) {
      break;
    }
    start = step.start;
    pending.push(step.next);
  }
  return start;
}

export function singleToken(source: BareSource, { from, to }: Span): Token | undefined {
  return to - from === 1 ? source.tokens[from] : undefined;
}

export function tokenText(source: BareSource, { from, to }: Span, separator: string): string {
  return source.tokens
    .slice(from, to)
    .map(({ text }) => text)
    .join(separator);
}
