import {
  REVIEW as untypedReview,
  SAFE as untypedSafe,
} from '../../../../core/fix/engine/safety.mjs';

const REVIEW: string = untypedReview;
const SAFE: string = untypedSafe;
const SUGGESTION_TOOL = 'eslint-lint';

export const suggestionRules: Readonly<Record<string, string>> = Object.freeze({
  'no-case-declarations': SAFE,
  'no-prototype-builtins': SAFE,
  'no-compare-neg-zero': SAFE,
  '@typescript-eslint/no-unnecessary-type-constraint': SAFE,
  '@typescript-eslint/no-useless-constructor': SAFE,
  '@typescript-eslint/no-non-null-asserted-nullish-coalescing': SAFE,
  '@typescript-eslint/no-non-null-asserted-optional-chain': REVIEW,
  'no-unused-private-class-members': REVIEW,
  'use-isnan': REVIEW,
  'preserve-caught-error': REVIEW,
  '@typescript-eslint/require-await': REVIEW,
  '@typescript-eslint/await-thenable': REVIEW,
  '@typescript-eslint/ban-ts-comment': REVIEW,
  '@typescript-eslint/no-array-delete': REVIEW,
  '@typescript-eslint/use-unknown-in-catch-callback-variable': REVIEW,
  '@typescript-eslint/switch-exhaustiveness-check': REVIEW,
});

export function suggestionName(rule: string | undefined): string {
  return `${SUGGESTION_TOOL}/${String(rule)}`;
}

export function isRuleSelected(
  rule: string | undefined,
  selectedRules: readonly string[],
): boolean {
  const selected = new Set(selectedRules);
  const safety = rule === undefined ? undefined : suggestionRules[rule];
  if (safety === undefined) {
    return false;
  }
  return selected.size === 0 ? safety === SAFE : selected.has(suggestionName(rule));
}
