import { MESSAGES, RULE_IDS, TEST_TIME_DEFAULTS, renderMessage } from '../../policy.mjs';
import { exceptionText } from '../exceptions.mjs';
import { SLOW_TEST_FIXES, SLOW_TEST_MOVES } from './slow-test-fixes.mjs';

/** The unit and integration budgets in seconds: the defaults, over which the config's `limits` win. */
export function slowTestBudget(limits) {
  return { ...TEST_TIME_DEFAULTS, ...limits };
}

/** The slowest run of each test, keyed by `keyOf(run)`; a rerun test keeps its slowest time. */
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

/**
 * The finding for a test over its budget, else an empty list. `test` is `{ name, seconds, path,
 * identity, line? }` (`path` the project-relative test file), `integration` picks the budget and
 * `language` the advice (`typescript` or `python`).
 */
export function slowTestFindings({ tool, language, test, integration, limits }) {
  const limit = budgetFor(limits, integration);
  if (test.seconds <= limit) {
    return [];
  }
  const fix = renderMessage(SLOW_TEST_FIXES[language], {
    move: integration ? '' : SLOW_TEST_MOVES[language],
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
        seconds: test.seconds.toFixed(1),
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
