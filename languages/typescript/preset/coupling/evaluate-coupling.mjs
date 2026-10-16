import { evaluateCoupling as evaluateCouplingMetrics } from '../../../../shared/rules/coupling.mjs';
import { exceptionMatcher, exceptionText } from '../../../../shared/rules/file-limits.mjs';
import { renderMessage, MESSAGES, RULE_IDS } from '../../../../shared/policy.mjs';

function sharedUsageFinding(entry, analyzerName) {
  const rule = RULE_IDS.sharedUsedByOneFeature;
  return {
    tool: analyzerName,
    rule,
    path: entry.source,
    identity: rule,
    message: renderMessage(MESSAGES.sharedUsedByOneFeature, {
      path: entry.source,
      feature: entry.feature,
      directory: entry.directory,
      exception: exceptionText(rule, entry.source),
    }),
    classification: 'enforceable',
  };
}

export function evaluateCoupling(report, analyzerName, exceptions = []) {
  const isExcepted = exceptionMatcher(exceptions);
  return [
    ...evaluateCouplingMetrics(report, analyzerName),
    ...(report.sharedUsedByOneFeature ?? [])
      .filter(({ source }) => !isExcepted(RULE_IDS.sharedUsedByOneFeature, source))
      .map((entry) => sharedUsageFinding(entry, analyzerName)),
  ];
}
