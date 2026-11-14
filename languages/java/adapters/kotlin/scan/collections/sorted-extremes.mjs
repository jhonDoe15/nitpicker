import { afterCall } from '../kotlin-brackets.mjs';

const SORT_CALL =
  /\.\s*(?:sorted|sortedDescending|sortedBy|sortedByDescending|sortedWith)(?=\s*[({.[])/g;
const END_TAKE = /^\s*\??\.\s*(?:first|last|firstOrNull|lastOrNull)\s*\(\s*\)|^\s*\[\s*0\s*\]/;

export function sortedExtremes(scanned) {
  const { code } = scanned;
  return [...code.matchAll(SORT_CALL)]
    .filter((match) => END_TAKE.test(code.slice(afterCall(code, match.index + match[0].length))))
    .map((match) => ({ rule: 'SortForExtreme', offset: match.index }));
}
