import {
  DEAD_CODE_RULES,
  FUNCTION_EXCEPTION_RULES,
  NAME_EXCEPTION_RULES,
  RULE_IDS,
} from '../policy.mjs';
import { functionNameOf } from './matching.mjs';
import { exceptionRoute, toolsOf } from './rule-names.mjs';
import {
  CODING_STANDARDS_RULE_PREFIXES,
  CODING_STANDARDS_RULES,
  DEPENDENCY_RULES,
} from './rule-tools.mjs';
import { appendSentence } from './sentence.mjs';

export const ROUTED_RULES = [
  RULE_IDS.mutantSurvived,
  RULE_IDS.mutantNoCoverage,
  RULE_IDS.stabilityDirection,
  RULE_IDS.noProductionRuntime,
  RULE_IDS.typeOnlyProductionDependency,
  RULE_IDS.publicAlternativeBypass,
  ...DEAD_CODE_RULES,
  ...CODING_STANDARDS_RULES,
  ...DEPENDENCY_RULES,
];

function narrowing(finding) {
  if (FUNCTION_EXCEPTION_RULES.includes(finding.rule)) {
    const functionName = functionNameOf(finding);
    return functionName === undefined ? {} : { function: functionName };
  }
  return NAME_EXCEPTION_RULES.includes(finding.rule) && finding.symbol !== undefined
    ? { name: finding.symbol }
    : {};
}

/**
 * The rule an `exceptions` entry names for a finding of a rule nitpicker adds, if its message does
 * not name the route itself: the rule must be one of its tool's.
 */
export function sharedRouteRule(finding) {
  const routed =
    ROUTED_RULES.includes(finding.rule) ||
    CODING_STANDARDS_RULE_PREFIXES.some((prefix) => finding.rule.startsWith(prefix));
  return routed && toolsOf(finding.rule)?.includes(finding.tool) ? finding.rule : undefined;
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
          message: appendSentence(
            finding.message,
            exceptionRoute({ rule, path: finding.path, ...narrowing(finding) }),
          ),
        };
  });
}
