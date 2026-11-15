import type { FunctionMetric, ReportEntry } from './crap-types.mts';

function entryOf(metric: FunctionMetric): ReportEntry {
  return {
    source: metric.relativePath,
    function: metric.displayName,
    lines: {
      start: metric.startLine,
      end: metric.endLine,
    },
    complexity: metric.complexity,
    statementCoverage: metric.statementCoverage,
    branchCoverage: metric.branchCoverage,
    effectiveCoverage: metric.coverage,
    crap: metric.crapScore,
  };
}

function byCrapDescending(left: ReportEntry, right: ReportEntry): number {
  if (left.crap === undefined) {
    return right.crap === undefined ? 0 : 1;
  }
  return right.crap === undefined ? -1 : right.crap - left.crap;
}

export function reportFunctionsOf(metrics: readonly FunctionMetric[]): ReportEntry[] {
  return metrics.map(entryOf).sort(byCrapDescending);
}
