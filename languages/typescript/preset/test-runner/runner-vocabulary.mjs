import { readHeadPolicy } from '../head-policy.mjs';
import { DEFAULT_TEST_RUNNER } from './runners.mjs';

const EVENT_OR_TICK = 'an awaited event or promise, or mock.timers.tick';
const EVENT_OR_CLOCK = 'an awaited event or promise, or a fake clock advanced with clock.tickAsync';
const TESTING_LIBRARY_WAIT = 'waitFor from Testing Library or jest.advanceTimersByTimeAsync';
const EACH_WITH_TABLE = 'give each case its own test with it.each';
const EACH_WITH_LOOP =
  'give each case its own test: `for (const testCase of cases) { it(testCase.name, () => { ... }); }`';
const EXPECT_VISIBLE = '`expect(screen.getByRole(...)).toBeVisible()`';
const ASSERT_PRESENT = '`assert.ok(screen.getByRole(...))`';
const ASSERT_FOCUS = '`assert.equal(document.activeElement, element)`';
const MATCHER_ANY =
  'an asymmetric matcher (`expect.any`, `expect.stringContaining`, `expect.objectContaining`): assert the whole value with `toEqual`';

const VOCABULARY = {
  vitest: {
    waitOnCondition: 'vi.waitFor or expect.poll',
    pollInstead: 'vi.waitFor / expect.poll',
    advanceFakeTime: 'vi.advanceTimersByTime',
    environmentDirective: '@vitest-environment',
    domSetup: 'a `/** @vitest-environment jsdom */` comment at the top of the test file',
    rejection: '`vi.fn().mockRejectedValue(value)`',
    assertCall: '`expect`',
    assertIt: '`expect` it',
    testFunctions: '`vitest`',
    sharedSetupHook: 'beforeAll',
    eachCase: EACH_WITH_TABLE,
    assertVisible: EXPECT_VISIBLE,
    assertFocus: '`toHaveFocus()`',
    anyInTests: MATCHER_ANY,
  },
  jest: {
    waitOnCondition: TESTING_LIBRARY_WAIT,
    pollInstead: TESTING_LIBRARY_WAIT,
    advanceFakeTime: 'jest.advanceTimersByTime',
    environmentDirective: '@jest-environment',
    domSetup: 'a `/** @jest-environment jsdom */` comment at the top of the test file',
    rejection: '`jest.fn().mockRejectedValue(value)`',
    assertCall: '`expect`',
    assertIt: '`expect` it',
    testFunctions: '`@jest/globals` or the Jest globals',
    sharedSetupHook: 'beforeAll',
    eachCase: EACH_WITH_TABLE,
    assertVisible: EXPECT_VISIBLE,
    assertFocus: '`toHaveFocus()`',
    anyInTests: MATCHER_ANY,
  },
  node: {
    waitOnCondition: EVENT_OR_TICK,
    pollInstead: EVENT_OR_TICK,
    advanceFakeTime: 'mock.timers.tick',
    environmentDirective: '@jest-environment',
    domSetup:
      'a setup file that registers global-jsdom (`import "global-jsdom/register"`), loaded with `--import` in the test script; node:test reads no environment comment in the test file',
    rejection:
      'an async mock that throws an `unknown` value: `mock.fn(async () => { throw value; })`',
    assertCall: '`assert`',
    assertIt: 'assert it',
    testFunctions: '`node:test`',
    sharedSetupHook: 'before',
    eachCase: EACH_WITH_LOOP,
    assertVisible: ASSERT_PRESENT,
    assertFocus: ASSERT_FOCUS,
    anyInTests:
      "a mock's recorded calls (`fn.mock.calls[0].arguments`): give `mock.fn` the function it replaces (`mock.fn(send)`) so its calls are typed",
  },
  mocha: {
    waitOnCondition: EVENT_OR_CLOCK,
    pollInstead: EVENT_OR_CLOCK,
    advanceFakeTime: 'clock.tick',
    environmentDirective: '@jest-environment',
    domSetup:
      'a setup file that registers global-jsdom (`--require global-jsdom/register`, or the same entry under `require` in .mocharc); Mocha reads no environment comment in the test file',
    rejection: 'an async stub that throws an `unknown` value: `async () => { throw value; }`',
    assertCall: '`expect` or `assert`',
    assertIt: 'assert it',
    testFunctions: 'the Mocha globals (`describe`, `it`)',
    sharedSetupHook: 'before',
    eachCase: EACH_WITH_LOOP,
    assertVisible: `${ASSERT_PRESENT}, or \`expect(screen.getByRole(...)).to.be.visible\` with chai-dom`,
    assertFocus: `${ASSERT_FOCUS}, or \`expect(element).to.have.focus\` with chai-dom`,
    anyInTests:
      'a sinon stub or matcher (`stub.firstCall.args`, `sinon.match.any`): type the stub (`sinon.stub<[string], number>()`) and assert the whole value',
  },
};

export function runnerVocabulary(runner = DEFAULT_TEST_RUNNER) {
  return VOCABULARY[runner] ?? VOCABULARY[DEFAULT_TEST_RUNNER];
}

export function recordedTestRunner(policy) {
  const tests = policy.tools?.tests;
  return tests?.runner ?? tests?.detectedRunner;
}

export function projectRunnerVocabulary() {
  return runnerVocabulary(recordedTestRunner(readHeadPolicy()));
}
