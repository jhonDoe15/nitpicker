import { DEFAULT_TEST_RUNNER } from './runners.mjs';

const EVENT_OR_TICK = 'an awaited event or promise, or mock.timers.tick';
const EVENT_OR_CLOCK = 'an awaited event or promise, or a fake clock advanced with clock.tickAsync';
const TESTING_LIBRARY_WAIT = 'waitFor from Testing Library or jest.advanceTimersByTimeAsync';

const VOCABULARY = {
  vitest: {
    waitOnCondition: 'vi.waitFor or expect.poll',
    pollInstead: 'vi.waitFor / expect.poll',
    advanceFakeTime: 'vi.advanceTimersByTime',
    environmentDirective: '@vitest-environment',
    rejection: '`vi.fn().mockRejectedValue(value)`',
    assertCall: '`expect`',
    assertIt: '`expect` it',
  },
  jest: {
    waitOnCondition: TESTING_LIBRARY_WAIT,
    pollInstead: TESTING_LIBRARY_WAIT,
    advanceFakeTime: 'jest.advanceTimersByTime',
    environmentDirective: '@jest-environment',
    rejection: '`jest.fn().mockRejectedValue(value)`',
    assertCall: '`expect`',
    assertIt: '`expect` it',
  },
  node: {
    waitOnCondition: EVENT_OR_TICK,
    pollInstead: EVENT_OR_TICK,
    advanceFakeTime: 'mock.timers.tick',
    environmentDirective: '@jest-environment',
    rejection:
      'an async mock that throws an `unknown` value: `mock.fn(async () => { throw value; })`',
    assertCall: '`assert`',
    assertIt: 'assert it',
  },
  mocha: {
    waitOnCondition: EVENT_OR_CLOCK,
    pollInstead: EVENT_OR_CLOCK,
    advanceFakeTime: 'clock.tick',
    environmentDirective: '@jest-environment',
    rejection: 'an async stub that throws an `unknown` value: `async () => { throw value; }`',
    assertCall: '`expect` or `assert`',
    assertIt: 'assert it',
  },
};

export function runnerVocabulary(runner = DEFAULT_TEST_RUNNER) {
  return VOCABULARY[runner] ?? VOCABULARY[DEFAULT_TEST_RUNNER];
}
