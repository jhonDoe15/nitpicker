// Config `exceptions` entries as a rule+path matcher, and the entry that would lift one finding.
//
// Language-neutral: shared by the file limits and the project-level checks of a language preset.

import { pathMatcher } from '../exceptions/matching.mjs';
import { exceptionEntryText } from '../exceptions/sentence.mjs';
import { EXCEPTION_HINT, renderMessage } from '../policy.mjs';

/**
 * `exceptions` holds `{ rule, paths }` config entries. The returned function says whether an
 * exception for `rule` matches any of the `candidates`.
 */
export function exceptionMatcher(exceptions) {
  const matchers = exceptions.map(({ rule, paths }) => ({ rule, matches: pathMatcher(paths) }));
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
