import path from 'node:path';
import type { Finding } from '../../static-checks/shared.mts';
import { hash } from '../typed/repository.mts';
import type * as Report from '../typed/reporting.mts';
import {
  branchCoverageFindings,
  metricFindings,
  mutantFindings,
  occurrenceCounter,
  positiveInteger,
} from '../typed/reporting.mts';
import type { Mutant, MutationReport } from '../typed/mutation.mts';
export { crapUnknownMessage, normalizeCrap } from './crap/crap-findings.mts';
import { appendAll } from '../../../../../shared/lists/lists.mts';

export function normalizeCoverage(
  report: Report.CoverageReport,
  analyzerName: string,
  { projectRoot, testCount }: Report.CoverageOptions,
): Finding[] {
  const findings: Finding[] = [];
  let coveredBranchOutcomes = 0;
  for (const [absolutePath, coverage] of Object.entries(report)) {
    const relativePath = path.relative(projectRoot, absolutePath).replaceAll('\\', '/');
    coveredBranchOutcomes += addFileCoverage(findings, coverage, { analyzerName, relativePath });
  }
  if (typeof testCount === 'number' && Number.isInteger(testCount) && testCount > 0) {
    addTestEfficiency(findings, analyzerName, { coveredBranchOutcomes, testCount });
  }
  return findings;
}

function addFileCoverage(
  findings: Finding[],
  coverage: Report.FileCoverage,
  { analyzerName, relativePath }: Report.FileCoverageTarget,
): number {
  const branchEntries = Object.entries(coverage.b ?? {});
  const branchOutcomes = branchEntries.flatMap(([, outcomes]) => outcomes);
  appendAll(
    findings,
    metricFindings({
      analyzerName,
      rule: 'coverage',
      path: relativePath,
      identity: 'branches',
      message: `Branch coverage for ${relativePath}`,
      metricName: 'branches',
      value: coveragePercent(branchOutcomes),
    }),
  );
  const branches = branchEntries.map(([branchId, outcomes]) => {
    const line = coverage.branchMap?.[branchId]?.loc?.start?.line;
    return {
      path: relativePath,
      key:
        coverage.branchSourceHashes?.[branchId] ??
        hash(JSON.stringify(coverage.branchMap?.[branchId] ?? { branchId })),
      percent: coveragePercent(outcomes),
      line,
      arms: coverage.uncoveredArms?.[branchId],
      symbol: coverage.branchFunctions?.[branchId],
    };
  });
  appendAll(
    findings,
    branchCoverageFindings(branches, {
      tool: analyzerName,
      identify: (key, occurrence) => `branch-source:${key}:occurrence:${String(occurrence)}`,
    }),
  );
  return branchOutcomes.filter((value) => value > 0).length;
}

function addTestEfficiency(
  findings: Finding[],
  analyzerName: string,
  { coveredBranchOutcomes, testCount }: Report.Efficiency,
): void {
  appendAll(
    findings,
    metricFindings({
      analyzerName,
      rule: 'test-efficiency',
      path: '.',
      identity: 'covered-branches-per-test',
      message: 'Covered branch outcomes per test',
      metricName: 'coveredBranchesPerTest',
      value: coveredBranchOutcomes / testCount,
    }),
  );
  appendAll(
    findings,
    metricFindings({
      analyzerName,
      rule: 'test-efficiency',
      path: '.',
      identity: 'test-count',
      message: 'Executed test count',
      metricName: 'testCount',
      value: testCount,
    }),
  );
}

export function normalizeMutation(report: MutationReport, analyzerName: string): Finding[] {
  const mutants: Report.NeutralMutant[] = [];
  const statusCounts = new Map<string, number>();
  const nextOccurrence = occurrenceCounter();
  for (const [filePath, file] of Object.entries(report.files ?? {})) {
    collectFileMutants(file, { filePath, mutants, statusCounts, nextOccurrence });
  }
  const findings = mutantFindings(mutants, { tool: analyzerName });
  for (const [status, value] of statusCounts) {
    appendAll(
      findings,
      metricFindings({
        analyzerName,
        rule: 'mutation-summary',
        path: '.',
        identity: `status:${status}`,
        message: `${status} mutants`,
        metricName: status,
        value,
      }),
    );
  }
  return findings;
}

const CAUGHT_MUTANT_STATUSES = new Set(['Killed', 'Timeout']);

function uncoveredWhenUnreached(mutant: Mutant): Mutant {
  return mutant.status === 'Survived' ? { ...mutant, status: 'NoCoverage', coveredBy: [] } : mutant;
}

export function withUnreachedMutantsUncovered(
  report: MutationReport,
  coverageAnalysis: unknown,
): MutationReport {
  const files = Object.entries(report.files ?? {});
  const mutants = files.flatMap(([, file]) => file.mutants ?? []);
  const coverageMissing = mutants.every((mutant) => mutant.coveredBy === undefined);
  if (
    coverageAnalysis === 'off' ||
    !coverageMissing ||
    mutants.some((mutant) => CAUGHT_MUTANT_STATUSES.has(mutant.status))
  ) {
    return report;
  }
  return {
    ...report,
    files: Object.fromEntries(
      files.map(([filePath, file]) => [
        filePath,
        { ...file, mutants: (file.mutants ?? []).map(uncoveredWhenUnreached) },
      ]),
    ),
  };
}

function collectFileMutants(
  file: Report.ReportedFile,
  { filePath, mutants, statusCounts, nextOccurrence }: Report.MutantTally,
): void {
  for (const mutant of file.mutants ?? []) {
    const status = mutant.status ?? 'Unknown';
    statusCounts.set(status, (statusCounts.get(status) ?? 0) + 1);
    if (status !== 'Killed') {
      mutants.push(neutralMutant(mutant, { filePath, status, nextOccurrence }));
    }
  }
}

function neutralMutant(
  mutant: Partial<Mutant>,
  { filePath, status, nextOccurrence }: Report.MutantSite,
): Report.NeutralMutant {
  const semanticIdentity = [
    mutant.mutatorName ?? 'unknown',
    hash(mutant.replacement ?? ''),
    mutant.sourceHash ?? hash(filePath),
  ].join('|');
  const occurrence = nextOccurrence(`${filePath}\0${status}\0${semanticIdentity}`);
  return {
    path: filePath,
    identity: `${semanticIdentity}|occurrence:${String(occurrence)}`,
    ...(mutant.sourceHash === undefined ? {} : { anchor: semanticIdentity }),
    status,
    ...(status === 'Ignored' ? { hiddenByComment: true } : {}),
    label: mutant.mutatorName ?? 'mutant',
    ...(mutant.functionName === undefined ? {} : { symbol: mutant.functionName }),
    line: mutant.location?.start?.line,
    ...(positiveInteger(mutant.location?.start?.column) === undefined
      ? {}
      : { column: mutant.location?.start?.column }),
    ...(typeof mutant.original === 'string' && mutant.original.length > 0
      ? { original: mutant.original }
      : {}),
    ...(mutant.replacement === undefined ? {} : { replacement: mutant.replacement }),
  };
}

function coveragePercent(values: readonly number[]): number {
  if (values.length === 0) {
    return 100;
  }
  return (values.filter((value) => value > 0).length / values.length) * 100;
}
