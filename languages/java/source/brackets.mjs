const BRACKET = /[(){}[\]]/g;
const OPENERS = new Set(['(', '{', '[']);

export function closingIndex(code, openAt) {
  let depth = 0;
  for (const match of code.slice(openAt).matchAll(BRACKET)) {
    depth += OPENERS.has(match[0]) ? 1 : -1;
    if (depth === 0) {
      return openAt + match.index;
    }
  }
  return -1;
}
