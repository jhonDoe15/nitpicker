import type { Suite, TestScanned } from '../typed/discovery-types.mts';
import type { ProjectFlags, Report } from '../typed/report-types.mts';
import type { Located } from '../typed/rule-types.mts';
import { testBodies } from '../discovery/test-units.mts';
import {
  assertionsInControlFlow,
  CONTROL_FLOW_MESSAGE,
  CONTROL_FLOW_RULE,
} from './flow/assertion-flow.mts';
import { DROPPED_MESSAGE, DROPPED_RULE, droppedCallbacks } from './dropped/dropped-callbacks.mts';
import {
  MESSAGE_MESSAGE,
  MESSAGE_RULE,
  messagesAfterAssertions,
} from './dropped/message-after-assertion.mts';
import { loopScope } from './flow/loops/loop-scope.mts';
import { focusedTests, FOCUSED_MESSAGE, FOCUSED_RULE } from './focused-tests.mts';
import { RETRY_MESSAGE, RETRY_RULE, retriesInTests } from './retries/retry-tests.mts';
import { DISABLED_MESSAGE, DISABLED_RULE, skippedTests } from './skipped-tests.mts';
import { weakReports } from './weak/weak-reports.mts';

function flowReports(scanned: TestScanned, suites: Suite[]): Report[] {
  const tests = testBodies(scanned, suites);
  const scope = loopScope(scanned, tests);
  return tests.flatMap((test) => [
    ...assertionsInControlFlow(scanned, test, scope).map((entry) => ({
      rule: CONTROL_FLOW_RULE,
      offset: entry.from,
      symbol: test.symbol,
      key: `${test.symbol}:${entry.construct}`,
      message: CONTROL_FLOW_MESSAGE,
    })),
    ...scope.helperLoops(test).map((entry) => ({
      rule: CONTROL_FLOW_RULE,
      offset: entry.from,
      symbol: test.symbol,
      key: `${entry.helper}:loop`,
      message: CONTROL_FLOW_MESSAGE,
    })),
  ]);
}

function located(entries: Located[], rule: string, message: string): Report[] {
  return entries.map(({ symbol, offset, key = symbol }) => ({
    rule,
    offset,
    symbol,
    key,
    message,
  }));
}

export function honestyReports(
  scanned: TestScanned,
  suites: Suite[],
  project: ProjectFlags,
): Report[] {
  return [
    ...located(skippedTests(scanned, suites, project), DISABLED_RULE, DISABLED_MESSAGE),
    ...located(focusedTests(suites), FOCUSED_RULE, FOCUSED_MESSAGE),
    ...located(retriesInTests(scanned, suites), RETRY_RULE, RETRY_MESSAGE),
    ...flowReports(scanned, suites),
    ...located(droppedCallbacks(scanned, suites), DROPPED_RULE, DROPPED_MESSAGE),
    ...located(messagesAfterAssertions(scanned, suites), MESSAGE_RULE, MESSAGE_MESSAGE),
    ...weakReports(scanned, suites),
  ];
}
