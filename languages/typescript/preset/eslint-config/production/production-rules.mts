import type { Linter } from 'eslint';

export const productionSourceRules: Record<string, Linter.RuleEntry> = {
  'nitpicker/no-boolean-flag-parameter': 'error',
  'nitpicker/no-self-recursion': 'error',
  'nitpicker/no-cleanup-skipped-on-failure': 'error',
  'nitpicker/no-task-outliving-resource': 'error',
  'nitpicker/settle-pending-on-close': 'error',
  'nitpicker/release-listeners-on-close': 'error',
  'nitpicker/no-add-only-collection': 'error',
  'nitpicker/no-unguarded-registry-delete': 'error',
  'nitpicker/no-per-call-debounce': 'error',
  'nitpicker/no-uncleared-timeout': 'error',
  'nitpicker/no-per-call-registration': 'error',
  'nitpicker/no-tri-state-boolean': 'error',
  'nitpicker/no-unhandled-url-parse': 'error',
  'nitpicker/reusable-object-per-call': 'error',
  'nitpicker/no-compatibility-shim': 'error',
  'nitpicker/untested-round-trip': 'error',
};
