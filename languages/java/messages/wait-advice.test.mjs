import { describe, expect, it } from 'vitest';
import { FIXED_SLEEP_RULE, withWaitAdvice } from './wait-advice.mjs';

const sleep = {
  tool: 'pmd',
  rule: FIXED_SLEEP_RULE,
  path: 'src/test/java/shop/OrderTest.java',
  identity: 'sleep',
  message:
    'A fixed sleep makes the test slow and flaky. Wait on the condition: check it in a while loop.',
  classification: 'enforceable',
};
const other = { ...sleep, rule: 'NegativeWaitInTest', message: 'Do not prove absence by waiting.' };

describe('withWaitAdvice', () => {
  it('names Awaitility when the project has it on the test classpath', () => {
    const [advised, untouched] = withWaitAdvice([sleep, other], { testAwaitility: true });

    expect(advised.message).toMatch(
      /^A fixed sleep .* with Awaitility, which the project's tests use: /u,
    );
    expect(advised.message).toMatch(
      /exception for pmd\/FixedSleepInTest in nitpicker\.config\.json\.$/u,
    );
    expect(untouched).toBe(other);
  });

  it('keeps the deadline poll advice without Awaitility', () => {
    expect(withWaitAdvice([sleep], { testAwaitility: false })).toEqual([sleep]);
    expect(withWaitAdvice([sleep], {})).toEqual([sleep]);
  });
});
