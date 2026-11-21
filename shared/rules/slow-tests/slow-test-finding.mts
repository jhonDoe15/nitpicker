import {
  MESSAGES,
  RULE_IDS,
  TEST_TIME_DEFAULTS,
  messageFields,
  renderMessage,
} from '../../policy.mts';
import { exceptionText } from '../exceptions.mts';
import type { Finding } from '../../values/findings.mts';
import { fieldOf, fieldsOf, numberOr } from '../../values/readers.mts';
import { SLOW_TEST_FIXES, SLOW_TEST_MOVES } from './slow-test-fixes.mts';

const TEST_TIME_KEYS = ['unitTestSeconds', 'integrationTestSeconds'];

type SlowTestRun = {
  readonly path: string;
  readonly name: string;
  readonly identity: string;
  readonly seconds: number;
  readonly line?: number | undefined;
};
type SlowTestRequest = {
  readonly tool: string;
  readonly language: string;
  readonly advice?: string | undefined;
  readonly test: SlowTestRun;
  readonly integration: boolean;
  readonly limits?: unknown;
};

export function slowTestLimits(thresholds: unknown): Record<string, number> {
  return Object.fromEntries(
    TEST_TIME_KEYS.flatMap((key): [string, number][] => {
      const value = fieldOf(thresholds, key);
      return typeof value === 'number' ? [[key, value]] : [];
    }),
  );
}

export function shownSeconds(seconds: number, limit: number): string {
  const rounded = seconds.toFixed(1);
  return Number(rounded) === limit ? seconds.toFixed(2) : rounded;
}

export function slowTestBudget(limits: unknown): {
  unitTestSeconds: number;
  integrationTestSeconds: number;
} {
  const given = fieldsOf(limits);
  return {
    unitTestSeconds: numberOr(given['unitTestSeconds'], TEST_TIME_DEFAULTS.unitTestSeconds),
    integrationTestSeconds: numberOr(
      given['integrationTestSeconds'],
      TEST_TIME_DEFAULTS.integrationTestSeconds,
    ),
  };
}

export function slowestRuns<T>(runs: readonly T[], keyOf: (run: T) => string): T[] {
  const slowest = new Map<string, T>();
  for (const run of runs) {
    const key = keyOf(run);
    const known = slowest.get(key);
    const knownSeconds = known === undefined ? -1 : numberOr(fieldOf(known, 'seconds'), -1);
    if (knownSeconds < numberOr(fieldOf(run, 'seconds'), Number.NaN)) {
      slowest.set(key, run);
    }
  }
  return [...slowest.values()];
}

export function slowTestFindings({
  tool,
  language,
  advice = language,
  test,
  integration,
  limits,
}: SlowTestRequest): Finding[] {
  const limit = budgetFor(limits, integration);
  if (test.seconds <= limit) {
    return [];
  }
  const fixTemplate = SLOW_TEST_FIXES[language];
  if (fixTemplate === undefined) {
    throw new TypeError(`No slow test advice for ${language}`);
  }
  const fix = renderMessage(fixTemplate, {
    move: integration ? '' : SLOW_TEST_MOVES[advice],
  });
  return [
    {
      tool,
      rule: RULE_IDS.slowTest,
      path: test.path,
      identity: test.identity,
      ...(test.line === undefined ? {} : { location: { line: test.line } }),
      ...messageFields(MESSAGES.slowTest, {
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

function budgetFor(limits: unknown, integration: boolean): number {
  const budget = slowTestBudget(limits);
  return integration ? budget.integrationTestSeconds : budget.unitTestSeconds;
}
