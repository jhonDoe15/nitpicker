import type { Linter } from 'eslint';

export const textPathNumberRules: Record<string, Linter.RuleEntry> = {
  'nitpicker/no-unescaped-pattern-translation': 'error',
  'nitpicker/no-unescaped-filter-value': 'error',
  'nitpicker/no-unescaped-html-interpolation': 'error',
  'nitpicker/no-surrogate-splitting-cut': 'error',
  'nitpicker/no-newline-only-line-split': 'error',
  'nitpicker/no-host-port-colon-split': 'error',
  'nitpicker/no-ambiguous-lookup-key': 'error',
  'nitpicker/no-truncating-pair-split': 'error',
};

export const textPathNumberGuardRules: Record<string, Linter.RuleEntry> = {
  'nitpicker/no-unchecked-response-json': 'error',
  'nitpicker/no-wall-clock-elapsed': 'error',
  'nitpicker/no-overflowing-backoff': 'error',
  'nitpicker/no-index-bound-off-by-one': 'error',
  'nitpicker/no-negative-count': 'error',
  'nitpicker/no-nan-only-check': 'error',
  'nitpicker/no-expanding-replacement-string': 'error',
  'nitpicker/no-prefix-without-boundary': 'error',
  'nitpicker/no-unanchored-affix-replace': 'error',
  'nitpicker/no-case-mismatched-lookup': 'error',
  'nitpicker/no-mismatched-precondition-message': 'error',
  'nitpicker/no-malformed-query-text': 'error',
  'nitpicker/no-unpaged-listing': 'error',
};
