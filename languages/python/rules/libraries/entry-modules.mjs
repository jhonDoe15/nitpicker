import { globMatcher } from '../../../../shared/paths/glob.mjs';

export function entryFilesOf(sources, globs) {
  const matchers = globs.map((glob) => globMatcher(glob));
  return sources.filter((file) => matchers.some((matcher) => matcher.test(file)));
}
