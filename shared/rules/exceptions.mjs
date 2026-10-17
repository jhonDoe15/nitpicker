// Config `exceptions` entries as a rule+glob matcher, and the entry that would lift one finding.
//
// Language-neutral: shared by the file limits and the project-level checks of a language preset.

import { globMatcher } from '../glob.mjs';
import { EXCEPTION_HINT, renderMessage } from '../policy.mjs';

/**
 * `exceptions` holds `{ rule, paths }` config entries or `{ rule, glob }` runner entries. The
 * returned function says whether an exception for `rule` matches any of the `candidates`.
 */
export function exceptionMatcher(exceptions) {
  const matchers = exceptions.map(({ rule, paths, glob }) => ({
    rule,
    patterns: (paths ?? [glob]).map((pattern) => globMatcher(pattern)),
  }));
  return (rule, ...candidates) =>
    matchers.some(
      (matcher) =>
        matcher.rule === rule &&
        matcher.patterns.some((pattern) => candidates.some((candidate) => pattern.test(candidate))),
    );
}

/** The `exceptions` entry, as JSON, that lifts `rule` for `glob`; the reason is left to fill in. */
export function exceptionText(rule, glob) {
  return JSON.stringify({ rule, paths: [glob], reason: '...' });
}

/** The sentence that tells how to lift a finding of `rule` at `glob`. */
export function exceptionHint(rule, glob) {
  return renderMessage(EXCEPTION_HINT, { exception: exceptionText(rule, glob) });
}
