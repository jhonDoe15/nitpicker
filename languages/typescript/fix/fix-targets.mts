import { globMatcher as untypedGlobMatcher } from '../preset/layout.mjs';
import { createQualityChecks } from '../preset/quality-checks.mjs';
import type { Layout } from './typed/fix-views.mts';
import { prettierExclusions } from '../../../core/fix/extensions.mjs';

const globMatcher: (pattern: string) => { readonly test: (file: string) => boolean } =
  untypedGlobMatcher;

type Check = { readonly name: string; readonly patterns: readonly string[] };
type Targets = {
  readonly isEslintFile: (file: string) => boolean;
  readonly isPrettierFile: (file: string) => boolean;
};

function coveredBy(checks: readonly Check[], name: string): (file: string) => boolean {
  const matchers = (checks.find((check) => check.name === name)?.patterns ?? []).map(globMatcher);
  return (file) => matchers.some((matcher) => matcher.test(file));
}

export function fixTargets(layout: Layout): Targets {
  const checks = createQualityChecks(layout);
  const isLinted = coveredBy(checks.eslintChecks, 'eslint-lint');
  const isFormatted = coveredBy(checks.staticChecks, 'prettier-format');
  return {
    isEslintFile: (file) => !layout.isExcluded(file) && isLinted(file),
    isPrettierFile: (file) =>
      !layout.isExcluded(file) &&
      isFormatted(file) &&
      !prettierExclusions.some((pattern) => pattern.test(file)),
  };
}
