import { globMatcher } from '../../adapters/typed/runner/exception-views.mts';

export function entryFilesOf(sources: readonly string[], globs: readonly string[]): string[] {
  const matchers = globs.map((glob) => globMatcher(glob));
  return sources.filter((file) => matchers.some((matcher) => matcher.test(file)));
}
