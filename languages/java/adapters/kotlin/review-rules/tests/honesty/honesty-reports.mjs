import { testBodies } from '../discovery/test-units.mjs';
import {
  assertionsInControlFlow,
  CONTROL_FLOW_MESSAGE,
  CONTROL_FLOW_RULE,
} from './assertion-flow.mjs';
import { focusedTests, FOCUSED_MESSAGE, FOCUSED_RULE } from './focused-tests.mjs';
import { constantsOf, DISABLED_MESSAGE, DISABLED_RULE, skippedTests } from './skipped-tests.mjs';

function flowReports(scanned, suites) {
  return testBodies(scanned, suites).flatMap((test) =>
    assertionsInControlFlow(scanned, test.body).map((entry) => ({
      rule: CONTROL_FLOW_RULE,
      offset: entry.from,
      symbol: test.symbol,
      key: `${test.symbol}:${entry.construct}`,
      message: CONTROL_FLOW_MESSAGE,
    })),
  );
}

function located(entries, rule, message) {
  return entries.map(({ symbol, offset }) => ({ rule, offset, symbol, key: symbol, message }));
}

export function honestyReports(scanned, suites) {
  const skipped = skippedTests(suites, constantsOf(scanned));
  return [
    ...located(skipped, DISABLED_RULE, DISABLED_MESSAGE),
    ...located(focusedTests(suites), FOCUSED_RULE, FOCUSED_MESSAGE),
    ...flowReports(scanned, suites),
  ];
}
