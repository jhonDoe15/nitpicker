import { closingIndex, enclosingOpen } from '../../shared/kotlin-scan.mts';

const CONTINUING_END = /(?:[=+\-*/%&|<>!?:.,([]|->|\breturn|\belse|\bin|\bis|\bas|\bby)$/u;
const CONTROL_HEADER = /\b(?:if|while|for|when|catch)\s*$/u;
const BLOCK_HEADER = /^\s*(?:else\s+if|else|if|for|while|catch|when|try|finally|do|init)\b/u;
const FUNCTION_HEADER = /\bfun\b/u;
const PAREN_STEP: Readonly<Record<string, number>> = { ')': 1, '(': -1 };
const NEXT_CONTINUES = /^(?:[.?:=!<>+\-*/%&|[]|as\b|in\b|is\b|else\b)/u;

function openParenOf(code: string, close: number): number {
  let depth = 0;
  for (const [offset, character] of code
    .slice(0, close + 1)
    .split('')
    .reverse()
    .entries()) {
    depth += PAREN_STEP[character] ?? 0;
    if (depth === 0) {
      return close - offset;
    }
  }
  return -1;
}

function startsStatement(code: string, start: number): boolean {
  const before = code.slice(0, start).trimEnd();
  if (before === '' || /[{};]$/u.test(before)) {
    return true;
  }
  if (!code.slice(before.length, start).includes('\n')) {
    return false;
  }
  if (before.endsWith(')')) {
    const open = openParenOf(before, before.length - 1);
    return open >= 0 && !CONTROL_HEADER.test(before.slice(0, open));
  }
  return !CONTINUING_END.test(before);
}

function blockIsStatementBody(code: string, open: number): boolean {
  const before = code.slice(0, open);
  const boundary = Math.max(
    before.lastIndexOf(';'),
    before.lastIndexOf('{'),
    before.lastIndexOf('}'),
  );
  const header = before.slice(boundary + 1);
  return BLOCK_HEADER.test(header) || FUNCTION_HEADER.test(header);
}

function endsStatement(code: string, end: number, start: number): boolean {
  const rest = code.slice(end);
  const next = rest.trimStart();
  if (next === '') {
    return true;
  }
  if (next.startsWith('}')) {
    const open = enclosingOpen(code, start);
    return open >= 0 && closingIndex(code, open) >= end && blockIsStatementBody(code, open);
  }
  if (next.startsWith(';')) {
    return true;
  }
  return rest.slice(0, rest.length - next.length).includes('\n') && !NEXT_CONTINUES.test(next);
}

export function isDiscardedStatement(code: string, start: number, end: number): boolean {
  return startsStatement(code, start) && endsStatement(code, end, start);
}
