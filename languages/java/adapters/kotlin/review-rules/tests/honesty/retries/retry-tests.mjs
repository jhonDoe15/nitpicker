import { jvmRetries } from './jvm-retries.mjs';
import { kotestRetries } from './kotest-retries.mjs';

export const RETRY_RULE = 'RetryInTest';
export const RETRY_MESSAGE =
  'Remove the retry: a test that passes on a later attempt hides a flaky or racy test. Fix the cause, such as waiting on the condition instead of a fixed delay or isolating shared state.';

export function retriesInTests(scanned, suites) {
  return [...jvmRetries(scanned), ...kotestRetries(scanned, suites)];
}
