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

const EXPECT_FRAGMENT_FORMS =
  '`toContain`, or `toMatch` with a pattern that is not anchored `^...$`';
const EXPECT_PARTIAL_FORMS =
  '`toMatchObject`, `expect.objectContaining`, `expect.stringContaining`, `expect.arrayContaining`';
const VARIED_FIELD_ON_ITS_OWN =
  'For a field that varies, assert it on its own and compare the rest of the value whole.';

const VOCABULARY = {
  vitest: {
    wholeOutput: '`toEqual` or `toBe`',
    fragmentForms: EXPECT_FRAGMENT_FORMS,
    wholeValue: '`toEqual`',
    partialForms: EXPECT_PARTIAL_FORMS,
    variedField: 'Use `expect.any(Type)` for a field that varies.',
    helperFile: 'a file not named *.test.* or *.spec.*',
    fakeClock: '`vi.useFakeTimers()` and `vi.setSystemTime(...)`',
    fixRandom: '`vi.spyOn(Math, "random")`',
    collectIt: 'Rename it `*.test.ts` (or `*.spec.ts`).',
    waitOnCondition: 'vi.waitFor or expect.poll',
    pollInstead: 'vi.waitFor / expect.poll',
    advanceFakeTime: 'vi.advanceTimersByTime',
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
    wholeOutput: '`toEqual` or `toBe`',
    fragmentForms: EXPECT_FRAGMENT_FORMS,
    wholeValue: '`toEqual`',
    partialForms: EXPECT_PARTIAL_FORMS,
    variedField: 'Use `expect.any(Type)` for a field that varies.',
    helperFile:
      'a file Jest does not run as a test: not named *.test.* or *.spec.*, not under __tests__, and outside the testMatch or testRegex of the Jest config',
    fakeClock: '`jest.useFakeTimers()` and `jest.setSystemTime(...)`',
    fixRandom: '`jest.spyOn(Math, "random")`',
    collectIt:
      'Rename it `*.test.ts` (or `*.spec.ts`), move it under `__tests__/`, or match it with the `testMatch` of the Jest config.',
    waitOnCondition: TESTING_LIBRARY_WAIT,
    pollInstead: TESTING_LIBRARY_WAIT,
    advanceFakeTime: 'jest.advanceTimersByTime',
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
    wholeOutput: '`assert.deepStrictEqual` or `assert.strictEqual`',
    fragmentForms:
      "`assert.ok(text.includes('x'))`, or `assert.match` with a pattern that is not anchored `^...$`",
    wholeValue: '`assert.deepStrictEqual`',
    partialForms: '`assert.partialDeepStrictEqual`',
    variedField: VARIED_FIELD_ON_ITS_OWN,
    helperFile:
      'a file `node --test` does not run: not named *.test.*, *-test.*, *_test.*, test-*.* or test.*, not under a test/ folder, and outside the patterns of the test script',
    fakeClock: "`mock.timers.enable({ apis: ['Date'], now: ... })`",
    fixRandom: '`mock.method(Math, "random", () => 0.5)`',
    collectIt:
      'Rename it `*.test.ts`, or name its folder in the patterns of the `node --test` script.',
    waitOnCondition: EVENT_OR_TICK,
    pollInstead: EVENT_OR_TICK,
    advanceFakeTime: 'mock.timers.tick',
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
    wholeOutput: '`expect(...).to.deep.equal` or `assert.deepStrictEqual`',
    fragmentForms:
      '`include`, `contain` or `string` with text, or `match` with a pattern that is not anchored `^...$`',
    wholeValue: '`expect(...).to.deep.equal` or `assert.deepStrictEqual`',
    partialForms:
      '`include` or `contain` with an object, `include.members`, `containSubset`, `assert.partialDeepStrictEqual`',
    variedField: VARIED_FIELD_ON_ITS_OWN,
    helperFile:
      'a file outside the Mocha spec (test/*.{js,cjs,mjs} by default, or the spec in .mocharc.* and the test script)',
    fakeClock: '`sinon.useFakeTimers(...)`',
    fixRandom: '`sinon.stub(Math, "random")`',
    collectIt:
      'Move it where the Mocha spec finds it (`test/*.{js,cjs,mjs}` by default), or add its folder to `spec` in .mocharc.',
    waitOnCondition: EVENT_OR_CLOCK,
    pollInstead: EVENT_OR_CLOCK,
    advanceFakeTime: 'clock.tick',
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
