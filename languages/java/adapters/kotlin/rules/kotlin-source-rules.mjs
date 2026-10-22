import { readInside } from '../../../../../shared/conventions/read-inside.mjs';
import { exceptionRoute } from '../../../../../shared/exceptions/rule-names.mjs';
import { appendSentence } from '../../../../../shared/messages/exception-sentence.mjs';
import { createIdentityCounter } from '../../../../../shared/ingest/common.mjs';
import {
  CATCH_LOG_MESSAGE,
  CATCH_LOG_RULE,
  catchLogViolations,
} from '../../../source/catch-logging.mjs';
import { hasAssertion } from '../../../source/assertions.mjs';
import { testMethods } from '../../../source/test-methods.mjs';
import { maskKotlinSource } from './kotlin-literals.mjs';
import { TEST_ASSERTION_RULE } from './kotlin-rules.mjs';
import { kotlinFiles } from './kotlin-suppressions.mjs';

export const TEST_ASSERTION_MESSAGE =
  'This test has no assertion, so it passes whenever the code does not throw. Assert the result (assertEquals, assertFailsWith, `shouldBe`, MockK `verify`). A project helper that asserts is learned from the tests that end with it (conventions kotlin.assertionHelpers).';

const CATCH_LOG = { rule: CATCH_LOG_RULE, message: CATCH_LOG_MESSAGE };
const TEST_ASSERTION = { rule: TEST_ASSERTION_RULE, message: TEST_ASSERTION_MESSAGE };

function finding(file, identity, { rule, message }) {
  return {
    tool: 'detekt',
    rule,
    path: file,
    identity,
    message: appendSentence(message, exceptionRoute({ rule, path: file })),
    classification: 'enforceable',
  };
}

function filesOf(projectRoot, sourceRoots) {
  return [...new Set(sourceRoots.flatMap((root) => kotlinFiles(projectRoot, root)))].toSorted();
}

export function readCatchLogFindings(projectRoot, sourceRoots) {
  return filesOf(projectRoot, sourceRoots).flatMap((file) => {
    const next = createIdentityCounter();
    const { code } = maskKotlinSource(readInside(projectRoot, file, 'utf8') ?? '');
    return catchLogViolations(code, 'kotlin').map(({ receiver, level }) =>
      finding(file, next(`catch-log:${receiver}.${level}`), CATCH_LOG),
    );
  });
}

export function readTestAssertionFindings(projectRoot, testRoots, helpers = []) {
  return filesOf(projectRoot, testRoots).flatMap((file) => {
    const next = createIdentityCounter();
    const text = readInside(projectRoot, file, 'utf8') ?? '';
    return testMethods(text, 'kotlin')
      .filter(({ body }) => !hasAssertion({ body, language: 'kotlin', extra: helpers }))
      .map(({ name }) => finding(file, next(`test:${name}`), TEST_ASSERTION));
  });
}
