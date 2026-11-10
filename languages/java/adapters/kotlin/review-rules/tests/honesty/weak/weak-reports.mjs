import { testBodies } from '../../discovery/test-units.mjs';
import { calledChecks } from './called.mjs';
import { nonEmptyChecks } from './non-empty.mjs';
import { presenceChecks } from './presence.mjs';

export const WEAK_RULE = 'WeakAssertionInTest';
const WEAK_MESSAGE =
  'This check passes for almost any value: a not-null, non-empty or size-above-0 check, or a verify with only any() arguments. Assert the exact value, contents or length, such as assertEquals(listOf("a", "b"), items), and the call arguments. An exception fits only when the value cannot be pinned.';

function weakChecks(scanned, test) {
  const { body } = test;
  return [
    ...presenceChecks(scanned, body),
    ...nonEmptyChecks(scanned, body),
    ...calledChecks(scanned, body),
  ].toSorted((left, right) => left.offset - right.offset);
}

export function weakReports(scanned, suites) {
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
