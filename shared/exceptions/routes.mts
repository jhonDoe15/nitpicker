import {
  DEAD_CODE_RULES,
  FUNCTION_EXCEPTION_RULES,
  NAME_EXCEPTION_RULES,
  RULE_IDS,
} from '../policy.mts';
import { functionNameOf } from './matching.mts';
import { exceptionRoute } from './rule-names.mts';
import {
  CODING_STANDARDS_RULE_PREFIXES,
  CODING_STANDARDS_RULES,
  DEPENDENCY_RULES,
  toolsOf,
} from './rule-tools.mts';
import { appendSentence, hasExceptionRoute } from '../messages/exception-sentence.mts';

const ROUTED_RULES = [
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

export type RoutedFinding = {
  readonly tool: string;
  readonly rule: string;
  readonly path: string;
  readonly message: string;
  readonly classification: string;
  readonly symbol?: string | undefined;
};

function narrowing(finding: RoutedFinding): { function?: string; name?: string } {
  if (FUNCTION_EXCEPTION_RULES.includes(finding.rule)) {
    const functionName = functionNameOf(finding);
    return functionName === undefined ? {} : { function: functionName };
  }
  return NAME_EXCEPTION_RULES.includes(finding.rule) && finding.symbol !== undefined
    ? { name: finding.symbol }
    : {};
}

export function sharedRouteRule(finding: {
  readonly tool: string;
  readonly rule: string;
}): string | undefined {
  const routed =
    ROUTED_RULES.includes(finding.rule) ||
    CODING_STANDARDS_RULE_PREFIXES.some((prefix) => finding.rule.startsWith(prefix));
  return routed && toolsOf(finding.rule)?.includes(finding.tool) ? finding.rule : undefined;
}

export function withExceptionRoutes<Finding extends RoutedFinding>(
  findings: readonly Finding[],
  routeRule: ((finding: Finding) => string | undefined) | readonly string[] = sharedRouteRule,
): Finding[] {
  const ruleOf =
    typeof routeRule === 'function'
      ? routeRule
      : (finding: Finding) => (routeRule.includes(finding.rule) ? finding.rule : undefined);
  return findings.map((finding) => {
    const rule =
      finding.classification === 'enforceable' && !hasExceptionRoute(finding.message)
        ? ruleOf(finding)
        : undefined;
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
