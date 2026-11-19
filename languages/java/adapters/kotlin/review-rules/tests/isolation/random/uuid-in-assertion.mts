import type { TestScanned } from '../../typed/discovery-types.mts';
import type { ClockHit } from '../../typed/rule-types.mts';
import { execAt, trimmedEnd, wordBefore } from '../../discovery/text-scan.mts';
import { enclosingParens } from '../report.mts';

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

function directArgument(scanned: TestScanned, uuid: ClockHit): boolean {
  const [open] = enclosingParens(scanned.code, uuid.offset);
  return open !== undefined && EQUALITY_CALLS.has(wordBefore(scanned, open).word);
}

function nextToInfix(scanned: TestScanned, uuid: ClockHit): boolean {
  const before = wordBefore(scanned, trimmedEnd(scanned, uuid.offset)).word;
  return INFIX_NAMES.has(before) || execAt(scanned.code, INFIX_AFTER, uuid.end) !== undefined;
}

export function uuidInAssertion(scanned: TestScanned, uuid: ClockHit): boolean {
  return directArgument(scanned, uuid) || nextToInfix(scanned, uuid);
}
