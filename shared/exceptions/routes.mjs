import { FUNCTION_EXCEPTION_RULES, NAME_EXCEPTION_RULES, RULE_IDS } from '../policy.mjs';
import { functionNameOf } from './function-names.mjs';
import { exceptionRoute } from './rule-names.mjs';

export const ROUTED_RULES = [
  RULE_IDS.mutantSurvived,
  RULE_IDS.mutantNoCoverage,
  RULE_IDS.duplicateClone,
  RULE_IDS.stabilityDirection,
];

const sentence = (text) => (text.endsWith('.') ? text : `${text}.`);

function narrowing(finding) {
  if (FUNCTION_EXCEPTION_RULES.includes(finding.rule)) {
    const functionName = functionNameOf(finding);
    return functionName === undefined ? {} : { function: functionName };
  }
  return NAME_EXCEPTION_RULES.includes(finding.rule) && finding.symbol !== undefined
    ? { name: finding.symbol }
    : {};
}

/** The rule an `exceptions` entry names for a finding of a rule nitpicker adds, if it has a route. */
export function sharedRouteRule(finding) {
  return ROUTED_RULES.includes(finding.rule) ? finding.rule : undefined;
}

/**
 * Appends the exception entry that accepts each enforceable finding that `routeRule(finding)`
 * gives a rule for (a list of routed rule ids works too).
 */
export function withExceptionRoutes(findings, routeRule = sharedRouteRule) {
  const ruleOf =
    typeof routeRule === 'function'
      ? routeRule
      : (finding) => (routeRule.includes(finding.rule) ? finding.rule : undefined);
  return findings.map((finding) => {
    const rule = finding.classification === 'enforceable' ? ruleOf(finding) : undefined;
    return rule === undefined
      ? finding
      : {
          ...finding,
          message: `${sentence(finding.message)} ${exceptionRoute({ rule, path: finding.path, ...narrowing(finding) })}`,
        };
  });
}
