const measured = (percent) => ({ percent, status: 'measured', unknownReason: null });
const structuralNa = () => ({ percent: null, status: 'structural_na', unknownReason: null });
const unknown = (reason) => ({ percent: null, status: 'unknown', unknownReason: reason });

function coveredShare(total, covered) {
  return total === 0 ? null : (covered / total) * 100;
}

function statementPercent(statements) {
  return coveredShare(
    statements.length,
    statements.filter((statement) => statement.hits > 0).length,
  );
}

function branchPercent(branches) {
  const hits = branches.flatMap((branch) => branch.hits);
  return coveredShare(hits.length, hits.filter((count) => count > 0).length);
}

function metricOf(percent, expected, reason) {
  if (percent !== null) {
    return measured(percent);
  }
  return expected ? unknown(reason) : structuralNa();
}

function combine(statementCoverage, branchCoverage) {
  const metrics = [statementCoverage, branchCoverage];
  const percents = metrics
    .filter(({ status }) => status === 'measured')
    .map(({ percent }) => percent);
  if (percents.length > 0) {
    return measured(Math.min(...percents));
  }
  const reason = metrics.find(({ status }) => status === 'unknown')?.unknownReason;
  return reason === undefined
    ? { percent: 100, status: 'structural_na', unknownReason: null }
    : unknown(reason);
}

export function computeMethodCoverage(method, statements, branches) {
  const statementCoverage = metricOf(
    statementPercent(statements),
    method.expectsStatementCoverage,
    'statement_unattributed',
  );
  const branchCoverage = metricOf(
    branchPercent(branches),
    method.expectsBranchCoverage,
    'branch_unattributed',
  );
  return {
    coverage: combine(statementCoverage, branchCoverage),
    statementCoverage,
    branchCoverage,
  };
}

export function unavailableMethodCoverage(method, reason) {
  return {
    coverage: unknown(reason),
    statementCoverage: method.expectsStatementCoverage ? unknown(reason) : structuralNa(),
    branchCoverage: method.expectsBranchCoverage ? unknown(reason) : structuralNa(),
  };
}

export function crapScore(complexity, coveragePercent) {
  if (coveragePercent === null) {
    return null;
  }
  const uncovered = 1 - coveragePercent / 100;
  return complexity * complexity * uncovered * uncovered * uncovered + complexity;
}
