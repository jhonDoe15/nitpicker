import type { Suite, TestScanned } from '../../typed/discovery-types.mts';
import type { Keyed } from '../../typed/report-types.mts';
import { jvmRetries } from './jvm-retries.mts';
import { kotestRetries } from './kotest-retries.mts';

export const RETRY_RULE = 'RetryInTest';
export const RETRY_MESSAGE =
  'Remove the retry: a test that passes on a later attempt hides a flaky or racy test. Fix the cause, such as waiting on the condition instead of a fixed delay or isolating shared state.';

export function retriesInTests(scanned: TestScanned, suites: Suite[]): Keyed[] {
  return [...jvmRetries(scanned), ...kotestRetries(scanned, suites)];
}
