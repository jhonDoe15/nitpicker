import { TOUCHED_CODE_RULES } from '../../shared/policy.mjs';

// Which Java findings are held to the "touched code" standard by the differential comparison
// (`touchedCode.isStrictRule` in core/diff/compare.mjs): an uncovered branch on a line this change
// touched is new even if the base already had it. The rule list lives in shared/policy.mjs; this
// module only matches a finding against it. Only `shared/policy.mjs` is imported, so any entry
// point can load it. The TypeScript check named `changed-branch-coverage` keys its identity on
// branch source instead, so the policy limits the rule to the JaCoCo tool.
export function isJavaTouchedRule(rule, finding) {
  return TOUCHED_CODE_RULES.some(
    (entry) =>
      entry.rule === rule && (entry.tools === undefined || entry.tools.includes(finding?.tool)),
  );
}
