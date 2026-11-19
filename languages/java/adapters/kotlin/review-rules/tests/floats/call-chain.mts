import type { TestScanned } from '../typed/discovery-types.mts';
import { matchingOpen, repeatUntil, trimmedEnd, wordBefore } from '../discovery/text-scan.mts';

const MAX_CHAIN = 16;

export function receiverCalls(
  scanned: TestScanned,
  dot: number,
): { name: string; inner: string }[] {
  const found: { name: string; inner: string }[] = [];
  let end = trimmedEnd(scanned, dot);
  repeatUntil(MAX_CHAIN, () => {
    const open = scanned.code[end - 1] === ')' ? matchingOpen(scanned, end - 1) : -1;
    if (open < 0) {
      return true;
    }
    const { word, start } = wordBefore(scanned, open);
    found.push({ name: word, inner: scanned.code.slice(open + 1, end - 1) });
    end = trimmedEnd(scanned, start);
    if (scanned.code[end - 1] !== '.') {
      return true;
    }
    end = trimmedEnd(scanned, end - 1);
    return false;
  });
  return found;
}

export function usesComparator(scanned: TestScanned, dot: number): boolean {
  return receiverCalls(scanned, dot).some(({ name }) => name.startsWith('using'));
}
