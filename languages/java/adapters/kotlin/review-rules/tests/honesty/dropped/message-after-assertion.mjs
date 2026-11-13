import { testBodies } from '../../discovery/test-units.mjs';
import { closeOf, matchingOpen, skipSpace, wordBefore } from '../../discovery/text-scan.mjs';

export const MESSAGE_RULE = 'MessageAfterAssertion';
export const MESSAGE_MESSAGE =
  'This AssertJ description or failure message comes after the assertion, so it never applies. Set it before the assertion: assertThat(x).as("...").isTrue() or assertThat(x).withFailMessage("...").isTrue(). An exception fits only code that is not AssertJ.';

const MESSAGE_NAMES = String.raw`\u0060as\u0060|describedAs|withFailMessage|overridingErrorMessage`;
const MESSAGE_CALL = new RegExp(String.raw`\.\s*(?:${MESSAGE_NAMES})\s*\(`, 'gu');
const ASSERTION_METHODS = [
  'is[A-Z]|has[A-Z]|contains|doesNot|matches|satisfies|startsWith|endsWith',
  'allMatch|anyMatch|noneMatch|allSatisfy|anySatisfy|noneSatisfy',
].join('|');
const ASSERTION_METHOD = new RegExp(`^(?:${ASSERTION_METHODS})`, 'u');
const ASSERTJ = /\borg\.assertj\b/u;

function followsAssertion(scanned, dot) {
  const before = scanned.code.slice(0, dot).trimEnd();
  if (!before.endsWith(')')) {
    return false;
  }
  const open = matchingOpen(scanned, before.length - 1);
  return open >= 0 && ASSERTION_METHOD.test(wordBefore(scanned, open).word);
}

const CONTINUES = /^\??\./u;

function endsChain(scanned, message) {
  const after = skipSpace(scanned.code, closeOf(scanned, message.open) + 1);
  return !CONTINUES.test(scanned.code.slice(after, after + 2));
}

export function messagesAfterAssertions(scanned, suites) {
  if (!ASSERTJ.test(scanned.source)) {
    return [];
  }
  return testBodies(scanned, suites).flatMap((test) =>
    [...scanned.source.slice(test.body.start, test.body.end).matchAll(MESSAGE_CALL)]
      .map((match) => ({
        dot: test.body.start + match.index,
        open: test.body.start + match.index + match[0].length - 1,
      }))
      .filter((message) => followsAssertion(scanned, message.dot) && endsChain(scanned, message))
      .map(({ dot }) => dot)
      .map((dot) => ({ offset: dot, symbol: test.symbol, key: `${test.symbol}:message` })),
  );
}
