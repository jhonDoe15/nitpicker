import { afterCall } from '../kotlin-brackets.mts';
import type { Scanned } from '../typed/scan-shapes.mts';

const SORT_CALL =
  /\.\s*(?:sorted|sortedDescending|sortedBy|sortedByDescending|sortedWith)(?=\s*[({.[])/g;
const END_TAKE = /^\s*\??\.\s*(?:first|last|firstOrNull|lastOrNull)\s*\(\s*\)|^\s*\[\s*0\s*\]/;

export function sortedExtremes(scanned: Scanned): { rule: string; offset: number }[] {
  const { code } = scanned;
  return [...code.matchAll(SORT_CALL)]
    .filter((match) => END_TAKE.test(code.slice(afterCall(code, match.index + match[0].length))))
    .map((match) => ({ rule: 'SortForExtreme', offset: match.index }));
}
