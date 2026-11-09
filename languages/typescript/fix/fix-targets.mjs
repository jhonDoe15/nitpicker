import { globMatcher } from '../preset/layout.mjs';
import { createQualityChecks } from '../preset/quality-checks.mjs';
import { prettierExclusions } from '../../../core/fix/extensions.mjs';

function coveredBy(checks, name) {
  const matchers = checks.find((check) => check.name === name).patterns.map(globMatcher);
  return (file) => matchers.some((matcher) => matcher.test(file));
}

export function fixTargets(layout) {
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
