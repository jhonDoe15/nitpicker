const BRACKET = /[(){}[\]]/g;
const OPENERS = new Set(['(', '{', '[']);

export function closingIndex(code: string, openAt: number, brackets: RegExp = BRACKET): number {
  let depth = 0;
  for (const match of code.slice(openAt).matchAll(brackets)) {
    depth += OPENERS.has(match[0]) ? 1 : -1;
    if (depth === 0) {
      return openAt + match.index;
    }
  }
  return -1;
}
