import type { Finding } from '../../adapters/static-checks/shared.mts';
import { fieldOf, listOf } from '../../../../shared/values/readers.mts';
import {
  evaluateCouplingMetrics,
  exceptionMatcher,
  sharedUsageFindings,
} from './typed/typed-rules.mts';

export function evaluateCoupling(
  report: unknown,
  analyzerName: string,
  exceptions: readonly unknown[] = [],
): Finding[] {
  return [
    ...evaluateCouplingMetrics(report, analyzerName),
    ...sharedUsageFindings(listOf(fieldOf(report, 'sharedUsedByOneFeature')), {
      analyzerName,
      isExcepted: exceptionMatcher(exceptions),
    }),
  ];
}
