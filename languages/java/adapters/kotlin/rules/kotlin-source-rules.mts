import { readInside as untypedReadInside } from '../../../../../shared/conventions/read-inside.mjs';
import { exceptionHint as untypedExceptionHint } from '../../../../../shared/rules/exceptions.mjs';
import { createIdentityCounter as untypedCreateIdentityCounter } from '../../../../../shared/ingest/common.mjs';
import { callUntyped } from '../../../../../shared/values/boundaries/untyped-call.mts';
import { optionalText } from '../../../../../shared/values/readers.mts';
import type { Finding } from '../../../../../shared/values/findings.mts';
import {
  CATCH_LOG_MESSAGE,
  CATCH_LOG_RULE,
  catchLogViolations,
} from '../../../source/catch-logging.mts';
import { hasAssertion } from '../../../source/assertions.mts';
import { testMethods } from '../../../source/test-methods.mts';
import { swallowedCatchBlocks } from '../scan/rules/catches.mts';
import { maskKotlinSource } from './kotlin-literals.mts';
import { TEST_ASSERTION_RULE } from './kotlin-rules.mts';
import { kotlinFiles } from './kotlin-suppressions.mts';

export const TEST_ASSERTION_MESSAGE =
  'Assert the result (assertEquals, assertFailsWith, `shouldBe`, MockK `verify`): this test has no assertion, so it passes whenever the code does not throw. A project helper that asserts is learned from the tests that end with it (conventions kotlin.assertionHelpers).';

type Definition = { rule: string; message: string };
type Roots = { sourceRoots: readonly string[]; testRoots?: readonly string[] };

function readInside(root: string, relative: string): string {
  return optionalText(callUntyped(untypedReadInside, root, relative, 'utf8')) ?? '';
}
const exceptionHint: (rule: string, path: string) => string = untypedExceptionHint;
const createIdentityCounter: () => (identity: string) => string = untypedCreateIdentityCounter;

const LANGUAGE = 'kotlin';
const CATCH_LOG = { rule: CATCH_LOG_RULE, message: CATCH_LOG_MESSAGE };
const TEST_ASSERTION = { rule: TEST_ASSERTION_RULE, message: TEST_ASSERTION_MESSAGE };

function sourceRuleMessage({ rule, message }: Definition, file: string): string {
  return `${message} ${exceptionHint(rule, file)}`;
}

function finding(file: string, identity: string, definition: Definition): Finding {
  return {
    tool: 'detekt',
    rule: definition.rule,
    path: file,
    identity,
    message: sourceRuleMessage(definition, file),
    allowedForm: definition.message,
    classification: 'enforceable',
  };
}

function filesOf(projectRoot: string, sourceRoots: readonly string[]): string[] {
  return [...new Set(sourceRoots.flatMap((root) => kotlinFiles(projectRoot, root)))].toSorted();
}

export function readCatchLogFindings(
  projectRoot: string,
  { sourceRoots, testRoots = [] }: Roots,
): Finding[] {
  const swallowedChecked = new Set(filesOf(projectRoot, sourceRoots));
  return filesOf(projectRoot, [...sourceRoots, ...testRoots]).flatMap((file) => {
    const next = createIdentityCounter();
    const { code } = maskKotlinSource(readInside(projectRoot, file));
    const reportedElsewhere = swallowedChecked.has(file)
      ? swallowedCatchBlocks(code)
      : new Set<number>();
    return catchLogViolations(code, LANGUAGE, { reportedElsewhere }).map(({ receiver, level }) =>
      finding(file, next(`catch-log:${receiver}.${level}`), CATCH_LOG),
    );
  });
}

export function readTestAssertionFindings(
  projectRoot: string,
  testRoots: readonly string[],
  helpers: string[] = [],
): Finding[] {
  return filesOf(projectRoot, testRoots).flatMap((file) => {
    const next = createIdentityCounter();
    const text = readInside(projectRoot, file);
    return testMethods(text, LANGUAGE)
      .filter(({ body }) => !hasAssertion({ body, language: LANGUAGE, extra: helpers }))
      .map(({ name }) => finding(file, next(`test:${name}`), TEST_ASSERTION));
  });
}
