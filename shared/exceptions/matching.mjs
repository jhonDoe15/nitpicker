import { globToRegExp } from '../glob.mjs';

/** A test for a path against any of `globs`. */
export function pathMatcher(globs) {
  const matchers = globs.map((glob) => globToRegExp(glob));
  return (path) => matchers.some((matcher) => matcher.test(path));
}
