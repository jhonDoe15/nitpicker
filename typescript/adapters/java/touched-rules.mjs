import { TOUCHED_CODE_RULES } from '../../shared/policy.mjs';
export function isJavaTouchedRule(rule, finding) {
  return TOUCHED_CODE_RULES.some(
    (entry) => entry.rule === rule && entry.tools.includes(finding?.tool),
  );
}
