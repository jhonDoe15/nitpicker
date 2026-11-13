import { LEFT_OUT_CHECKS } from './left-out-checks.mjs';
import { REVIEW_CHECKS } from './review-checks.mjs';
import { SAFE_CHECKS } from './safe-checks.mjs';
import { OWN_CHECKS, ownChecksOf, ownRule } from '../own/own-checks.mjs';

const ERROR_PRONE_TOOL = 'errorprone';
export { LEFT_OUT_CHECKS, REVIEW_CHECKS, SAFE_CHECKS };

const SAFE = new Set(SAFE_CHECKS);
const REVIEW = new Set(REVIEW_CHECKS);

export function ruleOf(check) {
  return { tool: ERROR_PRONE_TOOL, rule: check };
}

export function isSafeCheck(check) {
  return SAFE.has(check);
}

export function isReviewCheck(check) {
  return REVIEW.has(check);
}

function ownSelected(selectedRules) {
  const names = new Set(selectedRules);
  return OWN_CHECKS.map(({ check }) => check).filter((check) => {
    const { tool, rule } = ownRule(check);
    return names.has(`${tool}/${rule}`);
  });
}

export function patchChecks(selectedRules) {
  const prefix = `${ERROR_PRONE_TOOL}/`;
  const selected = selectedRules
    .filter((name) => name.startsWith(prefix))
    .map((name) => name.slice(prefix.length));
  if (selectedRules.length === 0) {
    return [...SAFE_CHECKS, ...ownChecksOf('safe')];
  }
  return [
    ...selected.filter((check) => SAFE.has(check) || REVIEW.has(check)),
    ...ownSelected(selectedRules),
  ];
}
