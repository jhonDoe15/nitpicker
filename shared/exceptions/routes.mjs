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

/** Appends the exception entry that accepts each enforceable finding of a routed rule. */
export function withExceptionRoutes(findings, rules = ROUTED_RULES) {
  const isRouted = typeof rules === 'function' ? rules : (rule) => rules.includes(rule);
  return findings.map((finding) =>
    finding.classification === 'enforceable' && isRouted(finding.rule)
      ? {
          ...finding,
          message: `${sentence(finding.message)} ${exceptionRoute({ rule: finding.rule, path: finding.path, ...narrowing(finding) })}`,
        }
      : finding,
  );
}
