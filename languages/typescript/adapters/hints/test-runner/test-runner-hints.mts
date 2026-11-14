import { readLayout } from '../../typed/head-policy.mts';
import { projectRunnerVocabulary } from '../../../preset/test-runner/vocabulary/runner-vocabulary.mjs';
import { fieldOf, textOf } from '../../../../../shared/values/readers.mts';
import { type HintedFields, type Rewriter, restrictedMatcherText } from '../eslint-routes.mts';
import { directive, hinted } from '../stated-form.mts';

type RewriteInput = Parameters<Rewriter>[0];

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

export function runnerWord(key: string): string {
  const vocabulary: unknown = projectRunnerVocabulary();
  return textOf(fieldOf(vocabulary, key));
}

function rejectErrorsMessage({ text, relativePath }: RewriteInput): string | HintedFields {
  return readLayout().isTestFile(relativePath)
    ? hinted(text, ` In tests, reject with ${runnerWord('rejection')} to use a non-Error reason.`)
    : text;
}

function expectExpectMessage({ text }: RewriteInput): string | HintedFields {
  if (text !== NO_ASSERTIONS_TEXT) {
    return text;
  }
  return hinted(
    NO_ASSERTIONS_TEXT,
    `. Call ${runnerWord('assertCall')} in the test body: asserting helpers do not count, so return the value and ${runnerWord('assertIt')} in the test.`,
  );
}

function disabledTestMessage({ text }: RewriteInput): HintedFields {
  return hinted(text.replace(DISABLED_TEST_TAIL, '').replace(/\.$/u, ''), DISABLED_TEST_HINT);
}

function restrictedMatcherMessage({ text }: RewriteInput): string | HintedFields {
  const matcher = BACKTICKED_MATCHER.exec(text)?.[1];
  const replacement = matcher === undefined ? undefined : restrictedMatcherText(matcher);
  return replacement === undefined ? text : directive(replacement);
}

function nodeTestMessage({ text }: RewriteInput): HintedFields {
  return hinted(text, NODE_TEST_HINT);
}

export function testRunnerRewriters(
  appendHint: (hint: string) => Rewriter,
): readonly (readonly [string, Rewriter])[] {
  return [
    ['vitest/no-import-node-test', nodeTestMessage],
    ...['vitest', 'jest', 'node-test', 'mocha'].flatMap((namespace) => [
      [`${namespace}/no-disabled-tests`, disabledTestMessage] as const,
      [`${namespace}/expect-expect`, expectExpectMessage] as const,
    ]),
    ...['vitest', 'jest'].flatMap((namespace) => [
      [`${namespace}/no-restricted-matchers`, restrictedMatcherMessage] as const,
      [
        `${namespace}/prefer-called-with`,
        (): HintedFields => directive(PREFER_CALLED_WITH_TEXT),
      ] as const,
      [
        `${namespace}/require-to-throw-message`,
        (): HintedFields => directive(THROW_MESSAGE_TEXT),
      ] as const,
      [`${namespace}/no-conditional-expect`, appendHint(EXPECT_THROWS_HINT)] as const,
    ]),
    ...['node-test', 'mocha'].map(
      (namespace) =>
        [`${namespace}/no-conditional-expect`, appendHint(ASSERT_THROWS_HINT)] as const,
    ),
    ['@typescript-eslint/prefer-promise-reject-errors', rejectErrorsMessage],
  ];
}
