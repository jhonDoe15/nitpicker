import type { Span, TestScanned } from '../typed/discovery-types.mts';
import type { Report } from '../typed/report-types.mts';
import type { RuleInfo } from '../typed/rule-types.mts';
import { openBrackets } from '../../../scan/kotlin-brackets.mts';
import { chainName, classesOf } from '../discovery/declarations.mts';
import { functionAround } from '../global-state/state-restores.mts';

export function reportOf(
  scanned: TestScanned,
  { rule, message }: RuleInfo,
  hit: { offset: number; family: string },
): Report {
  const fn = functionAround(scanned, hit.offset);
  const symbol = chainName(classesOf(scanned), hit.offset, fn?.name);
  return { rule, offset: hit.offset, symbol, key: `${symbol}:${hit.family}`, message };
}

export function enclosingParens(code: string, offset: number): number[] {
  return openBrackets(code, offset, '(').toReversed();
}

export function inRanges(ranges: Span[], offset: number): boolean {
  return ranges.some(({ start, end }) => start <= offset && offset < end);
}
