import { closingIndex } from '../kotlin-source.mjs';

const SORT_CALL =
  /\.\s*(?:sorted|sortedDescending|sortedBy|sortedByDescending|sortedWith)\b(?=\s*[({.[])/g;
const END_TAKE = /^\s*(?:\?\.|\.)\s*(?:first|last|firstOrNull|lastOrNull)\s*\(\s*\)|^\s*\[\s*0\s*\]/;

function afterCall(code, from) {
  const next = /^\s*([({])/.exec(code.slice(from));
  if (next === null) {
    return from;
  }
  const open = from + next[0].length - 1;
  return afterCall(code, closingIndex(code, open) + 1);
}

export function sortedExtremes(scanned) {
  const { code } = scanned;
  return [...code.matchAll(SORT_CALL)]
    .filter((match) => END_TAKE.test(code.slice(afterCall(code, match.index + match[0].length))))
    .map((match) => ({ rule: 'SortForExtreme', offset: match.index }));
}
