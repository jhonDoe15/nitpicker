import type { TestScanned } from '../../typed/discovery-types.mts';
import { closeOf, execAt, wordBefore } from '../../discovery/text-scan.mts';
import { enclosingParens } from '../report.mts';

const MARKER_SETTER = /^set\w*(?:Timestamp|At|Time|Instant|Date|On)$/u;
const FIXED_CLOCK = /Clock\s*\.\s*$/u;
const RELATIVE_CALL = /\s*\??\.\s*(?:plus|minus)\w*\s*\(/uy;
const FIXED_WINDOW = 20;
const RELATIVE_STEPS = Array.from({ length: 8 });

function relativeEnd(scanned: TestScanned, from: number): number {
  return RELATIVE_STEPS.reduce<number>((end) => {
    const call = execAt(scanned.code, RELATIVE_CALL, end);
    return call === undefined ? end : closeOf(scanned, end + call[0].length - 1) + 1;
  }, from);
}

function isFixedClock(scanned: TestScanned, open: number): boolean {
  const { word, start } = wordBefore(scanned, open);
  const before = scanned.code.slice(Math.max(0, start - FIXED_WINDOW), start);
  return word === 'fixed' && FIXED_CLOCK.test(before);
}

export function isMarkerSpan(scanned: TestScanned, start: number, end: number): boolean {
  const open = enclosingParens(scanned.code, start)[0];
  if (open === undefined || scanned.code.slice(open + 1, start).trim() !== '') {
    return false;
  }
  const next = scanned.code.slice(relativeEnd(scanned, end)).trimStart()[0];
  const { word } = wordBefore(scanned, open);
  return (
    (next === ')' && MARKER_SETTER.test(word)) || (next === ',' && isFixedClock(scanned, open))
  );
}
