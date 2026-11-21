import { whileHolds } from '../../traversal.mts';
import { byText } from '../../text-order/by-text.mts';
import type { StringKind, StringLiteral } from '../typed/source-types.mts';

const NESTED_QUOTES = new Set(["'", '"', '`']);

type Delimiting = { at: number; depth: number };

function outsideStep(text: string, state: Delimiting, kind: StringKind): boolean {
  const char = text[state.at];
  if (char === '\\' && kind.escapes) {
    state.at += 2;
    return false;
  }
  if (text.startsWith(kind.close, state.at)) {
    state.at += kind.close.length;
    return true;
  }
  if (char === '\n' && !kind.multiline) {
    return true;
  }
  const { interpolation } = kind;
  const opens = interpolation !== undefined && text.startsWith(interpolation, state.at);
  const doubled = kind.doubledBraces === true && text.startsWith('{{', state.at);
  state.depth = opens && !doubled ? 1 : 0;
  state.at += opens ? interpolation.length + Number(doubled) : 1;
  return false;
}

function nestedEnd(text: string, at: number): number {
  const quote = text[at] ?? '';
  return delimitedEnd(text, at + 1, {
    close: quote,
    multiline: quote === '`',
    escapes: true,
    ...(quote === '`' ? { interpolation: '${' } : {}),
  });
}

function insideStep(text: string, state: Delimiting, kind: StringKind): boolean {
  const char = text[state.at];
  if (char === '\n' && !kind.multiline) {
    return true;
  }
  state.depth += Number(char === '{') - Number(char === '}');
  state.at =
    char !== undefined && NESTED_QUOTES.has(char) ? nestedEnd(text, state.at) : state.at + 1;
  return false;
}

export function delimitedEnd(text: string, start: number, kind: StringKind): number {
  const state: Delimiting = { at: start, depth: 0 };
  for (const current of whileHolds(state, ({ at }: Delimiting) => at < text.length)) {
    const step = current.depth > 0 ? insideStep : outsideStep;
    if (step(text, current, kind)) {
      return Math.min(state.at, text.length);
    }
  }
  return text.length;
}

function unescapedQuotes(body: string): string {
  return body.replaceAll(/\\([\s\S])/gu, (escape: string, char: string) =>
    char === '"' || char === "'" ? char : escape,
  );
}

export function canonicalString(raw: string, { prefix, opener, kind }: StringLiteral): string {
  const start = prefix.length + opener.length;
  const terminated = raw.length >= start + kind.close.length && raw.endsWith(kind.close);
  const body = raw.slice(start, terminated ? raw.length - kind.close.length : raw.length);
  const quote = kind.block === true ? '"""' : '"';
  const value = kind.block === true || /r/iu.test(prefix) ? body : unescapedQuotes(body);
  const letters = Array.from(prefix.toLowerCase())
    .filter((letter) => letter !== 'u')
    .toSorted(byText);
  return `${letters.join('')}${quote}${value}${terminated ? quote : '\0'}`;
}
