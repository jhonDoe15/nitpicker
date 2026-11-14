import { testBodies } from '../discovery/test-units.mjs';
import {
  assertionsInControlFlow,
  CONTROL_FLOW_MESSAGE,
  CONTROL_FLOW_RULE,
} from './flow/assertion-flow.mjs';
import { DROPPED_MESSAGE, DROPPED_RULE, droppedCallbacks } from './dropped/dropped-callbacks.mjs';
import {
  MESSAGE_MESSAGE,
  MESSAGE_RULE,
  messagesAfterAssertions,
} from './dropped/message-after-assertion.mjs';
import { loopScope } from './flow/loops/loop-scope.mjs';
import { focusedTests, FOCUSED_MESSAGE, FOCUSED_RULE } from './focused-tests.mjs';
import { RETRY_MESSAGE, RETRY_RULE, retriesInTests } from './retries/retry-tests.mjs';
import { DISABLED_MESSAGE, DISABLED_RULE, skippedTests } from './skipped-tests.mjs';
import { weakReports } from './weak/weak-reports.mjs';

function flowReports(scanned, suites) {
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

function located(entries, rule, message) {
  return entries.map(({ symbol, offset, key = symbol }) => ({
    rule,
    offset,
    symbol,
    key,
    message,
  }));
}

export function honestyReports(scanned, suites, project) {
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
