import type { Suite, TestNode, TestScanned } from '../../typed/discovery-types.mts';
import type { Report } from '../../typed/report-types.mts';
import type { Form } from '../../typed/rule-types.mts';
import { testBodies } from '../../discovery/test-units.mts';
import { calledChecks } from './called.mts';
import { nonEmptyChecks } from './non-empty.mts';
import { presenceChecks } from './presence.mts';

export const WEAK_RULE = 'WeakAssertionInTest';
const WEAK_MESSAGE =
  'This check passes for almost any value: a not-null, non-empty or size-above-0 check, or a verify with only any() arguments. Assert the exact value, contents or length, such as assertEquals(listOf("a", "b"), items), and the call arguments. An exception fits only when the value cannot be pinned.';

function weakChecks(scanned: TestScanned, test: TestNode): Form[] {
  const { body } = test;
  return [
    ...presenceChecks(scanned, body),
    ...nonEmptyChecks(scanned, body),
    ...calledChecks(scanned, body),
  ].toSorted((left, right) => left.offset - right.offset);
}

export function weakReports(scanned: TestScanned, suites: Suite[]): Report[] {
  return testBodies(scanned, suites).flatMap((test) =>
    weakChecks(scanned, test).map(({ offset, form }) => ({
      rule: WEAK_RULE,
      offset,
      symbol: test.symbol,
      key: `${test.symbol}:${form}`,
      message: WEAK_MESSAGE,
    })),
  );
}
