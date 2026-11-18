import { execAt, trimmedEnd, wordBefore } from '../../discovery/text-scan.mjs';
import { enclosingParens } from '../report.mjs';

const EQUALITY_CALLS = new Set(
  [
    'assertEquals assertSame assertArrayEquals assertIterableEquals',
    'isEqualTo isSameAs hasToString shouldBe',
  ]
    .join(' ')
    .split(' '),
);
const INFIX_NAMES = new Set(['shouldBe']);
const INFIX_AFTER = /(?:\s*\.\s*\w+(?:\s*\(\s*\))?)*\s+shouldBe\b/uy;

function directArgument(scanned, uuid) {
  const [open] = enclosingParens(scanned.code, uuid.offset);
  return open !== undefined && EQUALITY_CALLS.has(wordBefore(scanned, open).word);
}

function nextToInfix(scanned, uuid) {
  const before = wordBefore(scanned, trimmedEnd(scanned, uuid.offset)).word;
  return INFIX_NAMES.has(before) || execAt(scanned.code, INFIX_AFTER, uuid.end) !== null;
}

export function uuidInAssertion(scanned, uuid) {
  return directArgument(scanned, uuid) || nextToInfix(scanned, uuid);
}
