import { MESSAGES, RULE_IDS, TEST_TIME_DEFAULTS, renderMessage } from '../../policy.mjs';
import { exceptionText } from '../exceptions.mjs';
import { SLOW_TEST_FIXES, SLOW_TEST_MOVES } from './slow-test-fixes.mjs';

const TEST_TIME_KEYS = ['unitTestSeconds', 'integrationTestSeconds'];

export function slowTestLimits(thresholds) {
  return Object.fromEntries(
    TEST_TIME_KEYS.filter((key) => thresholds[key] !== undefined).map((key) => [
      key,
      thresholds[key],
    ]),
  );
}

export function shownSeconds(seconds, limit) {
  const rounded = seconds.toFixed(1);
  return Number(rounded) === limit ? seconds.toFixed(2) : rounded;
}

export function slowTestBudget(limits) {
  return { ...TEST_TIME_DEFAULTS, ...limits };
}

export function slowestRuns(runs, keyOf) {
  const slowest = new Map();
  for (const run of runs) {
    const key = keyOf(run);
    if ((slowest.get(key)?.seconds ?? -1) < run.seconds) {
      slowest.set(key, run);
    }
  }
  return [...slowest.values()];
}

export function slowTestFindings({ tool, language, advice = language, test, integration, limits }) {
  const limit = budgetFor(limits, integration);
  if (test.seconds <= limit) {
    return [];
  }
  const fix = renderMessage(SLOW_TEST_FIXES[language], {
    move: integration ? '' : SLOW_TEST_MOVES[advice],
  });
  return [
    {
      tool,
      rule: RULE_IDS.slowTest,
      path: test.path,
      identity: test.identity,
      ...(test.line === undefined ? {} : { location: { line: test.line } }),
      message: renderMessage(MESSAGES.slowTest, {
        name: test.name,
        seconds: shownSeconds(test.seconds, limit),
        kind: integration ? 'an integration' : 'a unit',
        limit,
        fix,
        exception: exceptionText(RULE_IDS.slowTest, test.path),
      }),
      classification: 'enforceable',
    },
  ];
}

function budgetFor(limits, integration) {
  const budget = slowTestBudget(limits);
  return integration ? budget.integrationTestSeconds : budget.unitTestSeconds;
}
