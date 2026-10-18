const CRAP_FUNCTION = {
  source: 'src/main/value.ts',
  function: 'value',
  sourceHash: 'h',
  lines: { start: 1, end: 3 },
  complexity: 1,
  statementCoverage: { percent: 100 },
  branchCoverage: { percent: 100 },
  effectiveCoverage: { percent: 100 },
};

export function sampleCrapFunctions(scores) {
  return scores.map((crap) => ({ ...CRAP_FUNCTION, crap }));
}
