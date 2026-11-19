import { describe, expect, it } from 'vitest';
import { DEFAULT_TEST_RUNNER, TEST_RUNNERS } from '../runners.mjs';
import { runnerVocabulary } from './runner-vocabulary.mjs';

describe('runnerVocabulary', () => {
  it('names the same terms for every runner', () => {
    const keys = Object.keys(runnerVocabulary(DEFAULT_TEST_RUNNER));

    expect(TEST_RUNNERS.map((runner) => Object.keys(runnerVocabulary(runner)))).toEqual(
      TEST_RUNNERS.map(() => keys),
    );
  });

  it('speaks Vitest by default and for an unknown runner', () => {
    expect(runnerVocabulary()).toBe(runnerVocabulary(DEFAULT_TEST_RUNNER));
    expect(runnerVocabulary('tap')).toBe(runnerVocabulary(DEFAULT_TEST_RUNNER));
  });

  it.each(['jest', 'node', 'mocha'])('keeps the vi namespace out of %s', (runner) => {
    expect(Object.values(runnerVocabulary(runner)).join(' ')).not.toMatch(/\bvi\.|vitest/u);
  });

  it.each([
    ['jest', 'jest.advanceTimersByTime'],
    ['node', 'mock.timers.tick'],
    ['mocha', 'clock.tick'],
  ])('advances fake time on %s with %s', (runner, call) => {
    expect(runnerVocabulary(runner).advanceFakeTime).toBe(call);
  });

  it.each([
    [DEFAULT_TEST_RUNNER, 'beforeAll'],
    ['jest', 'beforeAll'],
    ['node', 'before'],
    ['mocha', 'before'],
  ])('shares setup on %s in %s', (runner, hook) => {
    expect(runnerVocabulary(runner).sharedSetupHook).toBe(hook);
  });

  it.each([
    [
      'node',
      'a setup file that registers global-jsdom (`import "global-jsdom/register"`), loaded with `--import` in the test script; node:test reads no environment comment in the test file',
    ],
    [
      'mocha',
      'a setup file that registers global-jsdom (`--require global-jsdom/register`, or the same entry under `require` in .mocharc); Mocha reads no environment comment in the test file',
    ],
  ])('gives %s a loop of tests, a DOM setup file and plain assertions', (runner, setup) => {
    const { eachCase, domSetup, assertFocus, assertVisible } = runnerVocabulary(runner);

    expect([eachCase, domSetup, assertFocus, assertVisible].join(' ')).not.toMatch(
      /it\.each|@jest-environment|toHaveFocus|toBeVisible/u,
    );
    expect(eachCase).toBe(
      'give each case its own test: `for (const testCase of cases) { it(testCase.name, () => { ... }); }`',
    );
    expect(domSetup).toBe(setup);
  });
});
