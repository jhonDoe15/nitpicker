import { evaluateCoupling as evaluateCouplingMetrics } from '../../../../shared/rules/coupling.mjs';
import { exceptionMatcher } from '../../../../shared/rules/exceptions.mjs';
import { sharedUsageFindings } from '../../../../shared/rules/features/shared-usage.mjs';

export function evaluateCoupling(report, analyzerName, exceptions = []) {
  return [
    ...evaluateCouplingMetrics(report, analyzerName),
    ...sharedUsageFindings(report.sharedUsedByOneFeature ?? [], {
      analyzerName,
      isExcepted: exceptionMatcher(exceptions),
    }),
  ];
}
