import { readLayout } from '../../../preset/head-policy.mjs';
import { projectRunnerVocabulary } from '../../../preset/test-runner/vocabulary/runner-vocabulary.mjs';
import { restrictedMatchers } from '../../../preset/eslint-config/test-honesty/restricted-matchers.mjs';
import { directive, hinted } from '../stated-form.mjs';

const NO_ASSERTIONS_TEXT = 'Test has no assertions';

const DISABLED_TEST_TAIL =
  /\s*-\s*if you want to skip a test(?: suite)? temporarily, use \.todo\(\) instead$/u;

const DISABLED_TEST_HINT =
  '. Make it pass, or delete it together with the code it tests: do not skip it or mark it `todo`.';

const BACKTICKED_MATCHER = /`([\w.]+)`/u;

const PREFER_CALLED_WITH_TEXT =
  'A bare `toHaveBeenCalled()` passes for a call with any arguments. Assert them with `toHaveBeenCalledWith(...)`. An exception fits only when the arguments cannot be pinned.';

const THROW_MESSAGE_TEXT =
  "A bare `toThrow()` passes for any error. Pass the expected message: `toThrow('the message')`. An exception fits only when the message cannot be pinned.";
const EXPECT_THROWS_HINT =
  ' In a test, assert a failure with `expect(() => run()).toThrow(Specific)` or `await expect(promise).rejects.toThrow(Specific)` instead of asserting inside a `catch`.';

const ASSERT_THROWS_HINT =
  ' In a test, assert a failure with `assert.throws(() => run(), Specific)` or `await assert.rejects(promise, Specific)` (Chai: `expect(() => run()).to.throw(Specific)`) instead of asserting inside a `catch`.';

const NODE_TEST_HINT =
  ' nitpicker runs this project\'s tests with Vitest, which does not collect node:test files. Import from `vitest`, or, if the project runs its tests with node:test, set "tools.tests.runner" to "node" in nitpicker.config.json. An exception fits only a file that must stay on node:test while the rest of the project runs on Vitest.';

function rejectErrorsMessage({ text, relativePath }) {
  return readLayout().isTestFile(relativePath)
    ? hinted(
        text,
        ` In tests, reject with ${projectRunnerVocabulary().rejection} to use a non-Error reason.`,
      )
    : text;
}

function expectExpectMessage({ text }) {
  if (text !== NO_ASSERTIONS_TEXT) {
    return text;
  }
  const { assertCall, assertIt } = projectRunnerVocabulary();
  return hinted(
    NO_ASSERTIONS_TEXT,
    `. Call ${assertCall} in the test body: asserting helpers do not count, so return the value and ${assertIt} in the test.`,
  );
}

function disabledTestMessage({ text }) {
  return hinted(text.replace(DISABLED_TEST_TAIL, '').replace(/\.$/u, ''), DISABLED_TEST_HINT);
}

function restrictedMatcherMessage({ text }) {
  const matcher = BACKTICKED_MATCHER.exec(text)?.[1];
  const replacement = matcher === undefined ? undefined : restrictedMatchers[matcher];
  return replacement === undefined ? text : directive(replacement);
}

function nodeTestMessage({ text }) {
  return hinted(text, NODE_TEST_HINT);
}

export function testRunnerRewriters(appendHint) {
  return [
    ['vitest/no-import-node-test', nodeTestMessage],
    ...['vitest', 'jest', 'node-test', 'mocha'].flatMap((namespace) => [
      [`${namespace}/no-disabled-tests`, disabledTestMessage],
      [`${namespace}/expect-expect`, expectExpectMessage],
    ]),
    ...['vitest', 'jest'].flatMap((namespace) => [
      [`${namespace}/no-restricted-matchers`, restrictedMatcherMessage],
      [`${namespace}/prefer-called-with`, () => directive(PREFER_CALLED_WITH_TEXT)],
      [`${namespace}/require-to-throw-message`, () => directive(THROW_MESSAGE_TEXT)],
      [`${namespace}/no-conditional-expect`, appendHint(EXPECT_THROWS_HINT)],
    ]),
    ...['node-test', 'mocha'].map((namespace) => [
      `${namespace}/no-conditional-expect`,
      appendHint(ASSERT_THROWS_HINT),
    ]),
    ['@typescript-eslint/prefer-promise-reject-errors', rejectErrorsMessage],
  ];
}
