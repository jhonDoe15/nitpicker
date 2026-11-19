const BRACKETS: ReadonlyMap<string, string> = new Map([
  ['()', String.raw`[()]`],
  ['{}', String.raw`[{}]`],
  ['[]', String.raw`[[\]]`],
  ['<>', '[<>]'],
]);

export function matchingClose(text: string, open: number, pair = '()'): number {
  const source = BRACKETS.get(pair);
  if (source === undefined || text[open] !== pair[0]) {
    return -1;
  }
  const brackets = new RegExp(source, 'gu');
  brackets.lastIndex = open;
  let depth = 0;
  for (const match of text.matchAll(brackets)) {
    depth += match[0] === pair[0] ? 1 : -1;
    if (depth === 0) {
      return match.index;
    }
  }
  return -1;
}
