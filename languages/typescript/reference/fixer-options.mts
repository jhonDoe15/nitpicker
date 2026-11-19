import { FIX_GUARDS } from '../preset/eslint-config/fix-guards/fix-guards.mts';
import type { GuardStatus } from '../preset/eslint-config/fix-guards/guard-types.mts';
import type { RuleFacts } from './typed/inventory-types.mts';

const FIXERS_THAT_NEED_OPTIONS = new Set([
  '@typescript-eslint/no-explicit-any',
  '@typescript-eslint/no-unused-vars',
  'functional/prefer-immutable-types',
]);

function guardStatusOf(id: string): GuardStatus | undefined {
  const slash = id.lastIndexOf('/');
  return slash === -1 ? undefined : FIX_GUARDS[id.slice(0, slash)]?.[id.slice(slash + 1)]?.status;
}

export function fixerRuns(id: string, { fixable }: RuleFacts): boolean {
  const guarded = guardStatusOf(id);
  return (
    fixable === true &&
    !FIXERS_THAT_NEED_OPTIONS.has(id) &&
    (guarded === undefined || guarded === 'automatic')
  );
}

export function suggestionApplies(id: string): boolean {
  return guardStatusOf(id) === 'review';
}
