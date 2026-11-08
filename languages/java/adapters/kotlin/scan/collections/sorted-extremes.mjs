import { chainOf } from '../../../../../../shared/traversal.mjs';
import { closingIndex } from '../kotlin-source.mjs';

const SORT_CALL =
  /\.\s*(?:sorted|sortedDescending|sortedBy|sortedByDescending|sortedWith)\b(?=\s*[({.[])/g;
const END_TAKE = /^\s*\??\.\s*(?:first|last|firstOrNull|lastOrNull)\s*\(\s*\)|^\s*\[\s*0\s*\]/;

function nextArgumentsEnd(code, from) {
  const next = /\s*[({]/y;
  next.lastIndex = from;
  return next.exec(code) === null ? undefined : closingIndex(code, next.lastIndex - 1) + 1;
}

function afterCall(code, from) {
  return chainOf(from, (position) => nextArgumentsEnd(code, position)).at(-1) ?? from;
}

export function sortedExtremes(scanned) {
  const { code } = scanned;
  return [...code.matchAll(SORT_CALL)]
    .filter((match) => END_TAKE.test(code.slice(afterCall(code, match.index + match[0].length))))
    .map((match) => ({ rule: 'SortForExtreme', offset: match.index }));
}
