import { pathMatcher } from '../exceptions/matching.mjs';
import { canonicalRule } from '../exceptions/rule-names.mjs';
import { exceptionEntryText } from '../messages/exception-sentence.mjs';
import { EXCEPTION_HINT, renderMessage } from '../policy.mjs';

/**
 * `exceptions` holds `{ rule, paths }` config entries. The returned function says whether an
 * exception for `rule` matches any of the `candidates`.
 */
export function exceptionMatcher(exceptions) {
  const matchers = exceptions.map(({ rule, paths, glob }) => ({
    rule: canonicalRule(rule),
    matches: pathMatcher(paths ?? [glob]),
  }));
  return (rule, ...candidates) =>
    matchers.some(
      (matcher) =>
        matcher.rule === rule && candidates.some((candidate) => matcher.matches(candidate)),
    );
}

/** The `exceptions` entry, as JSON, that lifts `rule` for the file, folder or package `path`. */
export function exceptionText(rule, path) {
  return exceptionEntryText({ rule, path });
}

/** The sentence that tells how to lift a finding of `rule` at `path`. */
export function exceptionHint(rule, path) {
  return renderMessage(EXCEPTION_HINT, { exception: exceptionText(rule, path) });
}
