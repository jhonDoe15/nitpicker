import { chainOf } from '../../../../../shared/traversal.mjs';

const chainFrom: <T>(start: T, next: (position: T) => T | undefined) => T[] = chainOf;
const BRACKETS: Readonly<Record<string, RegExp>> = { '(': /[()]/g, '{': /[{}]/g, '[': /[[\]]/g };
const ARGUMENT_MARK = /[()[\]{},]/g;

export function matchesFrom(
  text: string,
  pattern: RegExp,
  from: number,
): RegExpStringIterator<RegExpExecArray> {
  const marks = new RegExp(pattern.source, 'g');
  marks.lastIndex = from;
  return text.matchAll(marks);
}

function bracketPattern(opener: string): RegExp {
  return BRACKETS[opener] ?? /[()]/g;
}

export function closingIndex(code: string, open: number): number {
  const opener = code[open] ?? '';
  let depth = 0;
  for (const { index, 0: bracket } of matchesFrom(code, bracketPattern(opener), open)) {
    depth += bracket === opener ? 1 : -1;
    if (depth === 0) {
      return index;
    }
  }
  return code.length;
}

type Span = { start: number; end: number };

export function splitArguments(code: string, open: number): { close: number; parts: Span[] } {
  const close = closingIndex(code, open);
  const parts: Span[] = [];
  let depth = 0;
  let start = open + 1;
  for (const { index, 0: mark } of matchesFrom(code.slice(0, close), ARGUMENT_MARK, open + 1)) {
    if (mark === ',' && depth === 0) {
      parts.push({ start, end: index });
      start = index + 1;
    } else if (mark !== ',') {
      depth += '([{'.includes(mark) ? 1 : -1;
    }
  }
  if (code.slice(start, close).trim() !== '') {
    parts.push({ start, end: close });
  }
  return { close, parts };
}

function depthsOf(code: string, opener: string): Int32Array {
  const depths = new Int32Array(code.length + 1);
  let depth = 0;
  let cursor = 0;
  for (const { index, 0: bracket } of code.matchAll(bracketPattern(opener))) {
    const opens = bracket === opener;
    const next = opens ? index + 1 : index;
    depths.fill(depth, cursor, next);
    depth += opens ? 1 : -1;
    cursor = next;
  }
  depths.fill(depth, cursor);
  return depths;
}

export function braceDepths(code: string): Int32Array {
  return depthsOf(code, '{');
}

export function parenDepths(code: string): Int32Array {
  return depthsOf(code, '(');
}

export function openBrackets(code: string, offset: number, opener = '{'): number[] {
  const open: number[] = [];
  for (const { index, 0: bracket } of code.slice(0, offset).matchAll(bracketPattern(opener))) {
    if (bracket === opener) {
      open.push(index);
    } else {
      open.pop();
    }
  }
  return open;
}

export function enclosingOpen(code: string, offset: number, opener = '{'): number {
  return openBrackets(code, offset, opener).at(-1) ?? -1;
}

function nextArgumentsEnd(code: string, from: number): number | undefined {
  const next = /\s*[({]/y;
  next.lastIndex = from;
  return next.exec(code) === null ? undefined : closingIndex(code, next.lastIndex - 1) + 1;
}

export function afterCall(code: string, from: number): number {
  return chainFrom(from, (position: number) => nextArgumentsEnd(code, position)).at(-1) ?? from;
}
