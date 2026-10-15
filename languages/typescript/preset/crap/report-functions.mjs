function entryOf(metric) {
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

function byCrapDescending(left, right) {
  if (left.crap === undefined) {
    return right.crap === undefined ? 0 : 1;
  }
  return right.crap === undefined ? -1 : right.crap - left.crap;
}

export function reportFunctionsOf(metrics) {
  return metrics.map(entryOf).sort(byCrapDescending);
}
