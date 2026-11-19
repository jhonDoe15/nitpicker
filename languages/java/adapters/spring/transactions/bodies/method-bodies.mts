import type { DelimiterEntry, MethodBody, MethodName } from '../transaction-types.mts';

const ANNOTATIONS = /^\s*(?:@[\w.]+(?:\s*\((?:[^()]|\([^()]*\))*\))?\s*)*/u;
const CLOSING: Readonly<Record<string, string>> = { ')': '(', '}': '{' };

function skipAnnotations(text: string, start: number): number {
  return start + (ANNOTATIONS.exec(text.slice(start))?.[0].length ?? 0);
}

export function nameAfter(text: string, start: number): MethodName | undefined {
  const skipped = skipAnnotations(text, start);
  const open = text.indexOf('(', skipped);
  if (open < 0) {
    return undefined;
  }
  const name = /([\w$]+)\s*$/u.exec(text.slice(skipped, open));
  return name === null ? undefined : { name: name[1] ?? '', offset: skipped + name.index, open };
}

function matchingClose(text: string, open: number, pair: string): number {
  const [left, right] = pair;
  let depth = 0;
  for (const [index, character] of text.slice(open).split('').entries()) {
    depth += character === left ? 1 : 0;
    depth -= character === right ? 1 : 0;
    if (depth === 0) {
      return open + index;
    }
  }
  return -1;
}

export function bodyOf(text: string, open: number): MethodBody {
  const from = matchingClose(text, open, '()');
  const begin = from < 0 ? -1 : text.indexOf('{', from);
  if (begin < 0 || text.slice(from, begin).includes(';')) {
    return { begin: open, end: open };
  }
  const end = matchingClose(text, begin, '{}');
  return { begin, end: end < 0 ? text.length : end };
}

function trackDelimiter(stack: DelimiterEntry[], character: string, index: number): void {
  if (character === '(' || character === '{') {
    stack.push({ character, index });
  } else if (Object.hasOwn(CLOSING, character) && stack.at(-1)?.character === CLOSING[character]) {
    stack.pop();
  }
}

export function delimiterStacks(
  text: string,
  offsets: readonly number[],
): Map<number, DelimiterEntry[]> {
  const wanted = new Set(offsets);
  const stacks = new Map<number, DelimiterEntry[]>();
  const stack: DelimiterEntry[] = [];
  for (const [index, character] of text.split('').entries()) {
    if (wanted.has(index)) {
      stacks.set(index, [...stack]);
    }
    trackDelimiter(stack, character, index);
  }
  return stacks;
}
