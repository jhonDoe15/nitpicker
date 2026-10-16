import { describe, expect, it } from 'vitest';
import { TEST_RUNNERS } from './runners.mjs';
import { runnerVocabulary } from './runner-vocabulary.mjs';

describe('runnerVocabulary', () => {
  it('names the same terms for every runner', () => {
    const [first, ...others] = TEST_RUNNERS.map((runner) => Object.keys(runnerVocabulary(runner)));

    for (const keys of others) expect(keys).toEqual(first);
  });

  it('speaks Vitest by default and for an unknown runner', () => {
    expect(runnerVocabulary()).toBe(runnerVocabulary('vitest'));
    expect(runnerVocabulary('tap')).toBe(runnerVocabulary('vitest'));
  });

  it('keeps the vi namespace out of every other runner', () => {
    for (const runner of ['jest', 'node', 'mocha']) {
      expect(Object.values(runnerVocabulary(runner)).join(' ')).not.toMatch(/\bvi\.|vitest/u);
    }
  });

  it.each([
    ['jest', 'jest.advanceTimersByTime'],
    ['node', 'mock.timers.tick'],
    ['mocha', 'clock.tick'],
  ])('advances fake time on %s with %s', (runner, call) => {
    expect(runnerVocabulary(runner).advanceFakeTime).toBe(call);
  });

  it.each([
    ['vitest', 'beforeAll'],
    ['jest', 'beforeAll'],
    ['node', 'before'],
    ['mocha', 'before'],
  ])('shares setup on %s in %s', (runner, hook) => {
    expect(runnerVocabulary(runner).sharedSetupHook).toBe(hook);
  });

  it.each(['node', 'mocha'])(
    'gives %s a loop of tests, a DOM setup file and plain assertions',
    (runner) => {
      const { eachCase, domSetup, assertFocus, assertVisible } = runnerVocabulary(runner);

      expect([eachCase, domSetup, assertFocus, assertVisible].join(' ')).not.toMatch(
        /it\.each|@jest-environment|toHaveFocus|toBeVisible/u,
      );
      expect(eachCase).toBe(
        'give each case its own test: `for (const testCase of cases) { it(testCase.name, () => { ... }); }`',
      );
      expect(domSetup).toMatch(/^a setup file that registers global-jsdom /u);
    },
  );
});
