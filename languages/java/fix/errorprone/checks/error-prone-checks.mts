import { LEFT_OUT_CHECKS } from './left-out-checks.mts';
import { REVIEW_CHECKS } from './review-checks.mts';
import { SAFE_CHECKS } from './safe-checks.mts';
import { OWN_CHECKS, ownChecksOf, ownRule } from '../own/own-checks.mts';
import { twinChecks } from './twin-rules.mts';
import type { RuleRef } from '../../../../../core/fix/typed/fix-types.mts';

const ERROR_PRONE_TOOL = 'errorprone';
export { LEFT_OUT_CHECKS, REVIEW_CHECKS, SAFE_CHECKS };

const SAFE = new Set(SAFE_CHECKS);
const REVIEW = new Set(REVIEW_CHECKS);

export function ruleOf(check: string): RuleRef {
  return { tool: ERROR_PRONE_TOOL, rule: check };
}

export function isSafeCheck(check: string): boolean {
  return SAFE.has(check);
}

export function isReviewCheck(check: string): boolean {
  return REVIEW.has(check);
}

function ownSelected(selectedRules: readonly string[]): string[] {
  const names = new Set(selectedRules);
  return OWN_CHECKS.map(({ check }) => check).filter((check) => {
    const { tool, rule } = ownRule(check);
    return names.has(`${tool}/${rule}`);
  });
}

const OFF_BY_DEFAULT_FIXES: ReadonlySet<string> = new Set(['FieldCanBeFinal']);

export function enablingFlags(checks: readonly string[]): string[] {
  return checks
    .filter((check) => OFF_BY_DEFAULT_FIXES.has(check))
    .map((check) => `-Xep:${check}:WARN`);
}

export function patchChecks(selectedRules: readonly string[]): string[] {
  const prefix = `${ERROR_PRONE_TOOL}/`;
  const selected = selectedRules
    .filter((name) => name.startsWith(prefix))
    .map((name) => name.slice(prefix.length));
  if (selectedRules.length === 0) {
    return [...SAFE_CHECKS, ...ownChecksOf('safe')];
  }
  return [
    ...new Set([
      ...[...selected, ...twinChecks(selectedRules)].filter(
        (check) => SAFE.has(check) || REVIEW.has(check),
      ),
      ...ownSelected(selectedRules),
    ]),
  ];
}
