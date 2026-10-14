import { exceptionRoute, RULE_IDS } from '../policy.mjs';

export const ROUTED_RULES = [
  RULE_IDS.mutantSurvived,
  RULE_IDS.mutantNoCoverage,
  RULE_IDS.duplicateClone,
  RULE_IDS.stabilityDirection,
];

/** Appends the exception entry that accepts each enforceable finding of a rule in `rules`. */
export function withExceptionRoutes(findings, rules = ROUTED_RULES) {
  return findings.map((finding) =>
    finding.classification === 'enforceable' && rules.includes(finding.rule)
      ? {
          ...finding,
          message: `${finding.message} ${exceptionRoute({ rule: finding.rule, path: finding.path })}`,
        }
      : finding,
  );
}
