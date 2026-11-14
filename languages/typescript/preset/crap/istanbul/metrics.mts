import type {
  CoverageMetric,
  FunctionDescriptor,
  MethodCoverage,
  BranchUnit,
  StatementUnit,
} from '../crap-types.mts';

type CoverageExpectation = Pick<
  FunctionDescriptor,
  'expectsStatementCoverage' | 'expectsBranchCoverage'
>;

function measured(percent: number): CoverageMetric {
  return { percent, status: 'measured', unknownReason: undefined };
}

function structuralNa(): CoverageMetric {
  return { percent: undefined, status: 'structural_na', unknownReason: undefined };
}

function unknown(reason: string | undefined): CoverageMetric {
  return { percent: undefined, status: 'unknown', unknownReason: reason };
}

function coveredShare(total: number, covered: number): number | undefined {
  return total === 0 ? undefined : (covered / total) * 100;
}

function statementPercent(statements: readonly StatementUnit[]): number | undefined {
  return coveredShare(
    statements.length,
    statements.filter((statement) => statement.hits > 0).length,
  );
}

function branchPercent(branches: readonly BranchUnit[]): number | undefined {
  const hits = branches.flatMap((branch) => branch.hits);
  return coveredShare(hits.length, hits.filter((count) => count > 0).length);
}

function metricOf(percent: number | undefined, expected: boolean, reason: string): CoverageMetric {
  if (percent !== undefined) {
    return measured(percent);
  }
  return expected ? unknown(reason) : structuralNa();
}

function combine(
  statementCoverage: CoverageMetric,
  branchCoverage: CoverageMetric,
): CoverageMetric {
  const metrics = [statementCoverage, branchCoverage];
  const percents = metrics
    .filter(({ status }) => status === 'measured')
    .flatMap(({ percent }) => (percent === undefined ? [] : [percent]));
  if (percents.length > 0) {
    return measured(Math.min(...percents));
  }
  const reason = metrics.find(({ status }) => status === 'unknown')?.unknownReason;
  return reason === undefined
    ? { percent: 100, status: 'structural_na', unknownReason: undefined }
    : unknown(reason);
}

export function computeMethodCoverage(
  method: CoverageExpectation,
  statements: readonly StatementUnit[],
  branches: readonly BranchUnit[],
): MethodCoverage {
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

export function unavailableMethodCoverage(
  method: CoverageExpectation,
  reason: string | undefined,
): MethodCoverage {
  return {
    coverage: unknown(reason),
    statementCoverage: method.expectsStatementCoverage ? unknown(reason) : structuralNa(),
    branchCoverage: method.expectsBranchCoverage ? unknown(reason) : structuralNa(),
  };
}

export function crapScore(
  complexity: number,
  coveragePercent: number | undefined,
): number | undefined {
  if (coveragePercent === undefined) {
    return undefined;
  }
  const uncovered = 1 - coveragePercent / 100;
  return complexity * complexity * uncovered * uncovered * uncovered + complexity;
}
