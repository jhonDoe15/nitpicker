import type { Finding } from '../../adapters/static-checks/shared.mts';
import { fieldOf, listOf, textOf } from '../../../../shared/values/readers.mts';
import { folderCycleFindings } from './cycles/folder-cycles.mts';
import type { ImportEdge } from './cycles/cycle-views.mts';
import {
  evaluateCouplingMetrics,
  exceptionMatcher,
  sharedUsageFindings,
} from './typed/typed-rules.mts';

function importEdge(entry: unknown): ImportEdge {
  return {
    from: textOf(fieldOf(entry, 'from')),
    to: textOf(fieldOf(entry, 'to')),
    typeOnly: fieldOf(entry, 'typeOnly') === true,
  };
}

export function evaluateCoupling(
  report: unknown,
  analyzerName: string,
  exceptions: readonly unknown[] = [],
  layout?: unknown,
): Finding[] {
  const isExcepted = exceptionMatcher(exceptions);
  return [
    ...evaluateCouplingMetrics(report, analyzerName),
    ...sharedUsageFindings(listOf(fieldOf(report, 'sharedUsedByOneFeature')), {
      analyzerName,
      isExcepted,
    }),
    ...folderCycleFindings(listOf(fieldOf(report, 'moduleImports')).map(importEdge), {
      analyzerName,
      isExcepted,
      layout,
      files: listOf(fieldOf(report, 'modules')).map((entry) => textOf(fieldOf(entry, 'file'))),
    }),
  ];
}
