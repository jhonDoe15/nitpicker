import path from 'node:path';
import type { Finding } from '../../static-checks/shared.mts';
import { DEFAULT_CRAP_SCORE_LIMIT, MESSAGES } from '../../../../../shared/policy.mjs';
import { hash } from '../typed/repository.mts';
import {
  type NeutralMutant,
  addMetric,
  branchCoverageFindings,
  crapFindings,
  mutantFindings,
  nextOccurrence,
  positiveInteger,
  summaryMetrics,
} from '../typed/reporting.mts';
import type { Mutant, MutationReport } from '../typed/mutation.mts';

type Position = { readonly line?: number; readonly column?: number };

export type Span = { readonly start?: Position; readonly end?: Position };

export type BranchMapEntry = {
  readonly type?: string;
  readonly loc?: Span;
  readonly locations?: readonly Span[];
};

export type FileCoverage = {
  readonly b?: Readonly<Record<string, readonly number[]>>;
  readonly branchMap?: Readonly<Record<string, BranchMapEntry>>;
  readonly branchSourceHashes?: Readonly<Record<string, string>>;
  readonly uncoveredArms?: Readonly<Record<string, readonly string[]>>;
  readonly branchFunctions?: Readonly<Record<string, string | undefined>>;
};

export type CoverageReport = Readonly<Record<string, FileCoverage>>;

type Percent = { readonly percent?: number };

export type CrapEntry = {
  readonly source: string;
  readonly function: string;
  readonly crap?: number;
  readonly complexity?: number;
  readonly start?: number;
  readonly end?: number;
  readonly lines?: { readonly start?: number; readonly end?: number };
  readonly sourceHash?: string;
  readonly anchorHash?: string;
  readonly declarationHash?: string;
  readonly statementCoverage?: Percent;
  readonly branchCoverage?: Percent;
  readonly effectiveCoverage?: Percent;
};

export type CrapReport = {
  readonly summary?: Readonly<Record<string, unknown>>;
  readonly functions?: readonly CrapEntry[];
};

type CoverageOptions = { readonly projectRoot: string; readonly testCount: unknown };

type FileCoverageTarget = { readonly analyzerName: string; readonly relativePath: string };

type Efficiency = { readonly coveredBranchOutcomes: number; readonly testCount: number };

type CrapSite = {
  readonly analyzerName: string;
  readonly scoreLimit: number;
  readonly occurrence: number;
  readonly violationOccurrence: number;
};

type MutantTally = {
  readonly filePath: string;
  readonly mutants: NeutralMutant[];
  readonly statusCounts: Map<string, number>;
  readonly occurrences: Map<string, number>;
};

type ReportedFile = { readonly mutants?: readonly Partial<Mutant>[] };

type MutantSite = {
  readonly filePath: string;
  readonly status: string;
  readonly occurrences: Map<string, number>;
};

export function normalizeCoverage(
  report: CoverageReport,
  analyzerName: string,
  { projectRoot, testCount }: CoverageOptions,
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
  coverage: FileCoverage,
  { analyzerName, relativePath }: FileCoverageTarget,
): number {
  const branchEntries = Object.entries(coverage.b ?? {});
  const branchOutcomes = branchEntries.flatMap(([, outcomes]) => outcomes);
  addMetric(findings, {
    analyzerName,
    rule: 'coverage',
    path: relativePath,
    identity: 'branches',
    message: `Branch coverage for ${relativePath}`,
    metricName: 'branches',
    value: coveragePercent(branchOutcomes),
  });
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
  findings.push(
    ...branchCoverageFindings(branches, {
      tool: analyzerName,
      identify: (key, occurrence) => `branch-source:${key}:occurrence:${String(occurrence)}`,
    }),
  );
  return branchOutcomes.filter((value) => value > 0).length;
}

function addTestEfficiency(
  findings: Finding[],
  analyzerName: string,
  { coveredBranchOutcomes, testCount }: Efficiency,
): void {
  addMetric(findings, {
    analyzerName,
    rule: 'test-efficiency',
    path: '.',
    identity: 'covered-branches-per-test',
    message: 'Covered branch outcomes per test',
    metricName: 'coveredBranchesPerTest',
    value: coveredBranchOutcomes / testCount,
  });
  addMetric(findings, {
    analyzerName,
    rule: 'test-efficiency',
    path: '.',
    identity: 'test-count',
    message: 'Executed test count',
    metricName: 'testCount',
    value: testCount,
  });
}

const COMPOSITION_ROOT_FILE = /(?:^|\/)(?:main|server|composition-root)\.[cm]?[jt]sx?$/u;

export function crapUnknownMessage(sourcePath: string): string {
  return COMPOSITION_ROOT_FILE.test(sourcePath)
    ? MESSAGES.crapCoverageUnknown
    : MESSAGES.crapCoverageUnknownPlain;
}

export function normalizeCrap(
  report: CrapReport,
  analyzerName: string,
  { scoreLimit }: { readonly scoreLimit: number } = { scoreLimit: DEFAULT_CRAP_SCORE_LIMIT },
): Finding[] {
  const findings = summaryMetrics(analyzerName, report.summary, 'crap');
  const occurrences = new Map<string, number>();
  const violations = new Map<string, number>();
  const functions = [...(report.functions ?? [])].sort(compareCrapSites);
  for (const entry of functions) {
    const occurrence = nextOccurrence(occurrences, `${entry.source}\0${entry.function}`);
    const overLimit = !(
      typeof entry.crap === 'number' &&
      Number.isFinite(entry.crap) &&
      entry.crap < scoreLimit
    );
    const violationOccurrence = overLimit
      ? nextOccurrence(violations, `${entry.source}\0${entry.function}\0${crapSourceHash(entry)}`)
      : occurrence;
    addCrapFunction(findings, entry, { analyzerName, scoreLimit, occurrence, violationOccurrence });
  }
  return findings;
}

function crapSourceHash(entry: CrapEntry): string {
  return (
    entry.sourceHash ??
    hash(`${entry.source}:${String(entry.lines?.start)}:${String(entry.lines?.end)}`)
  );
}

function compareCrapSites(left: CrapEntry, right: CrapEntry): number {
  return (
    left.source.localeCompare(right.source) ||
    (left.lines?.start ?? 0) - (right.lines?.start ?? 0) ||
    (left.lines?.end ?? 0) - (right.lines?.end ?? 0) ||
    left.function.localeCompare(right.function)
  );
}

function addCrapFunction(
  findings: Finding[],
  entry: CrapEntry,
  { analyzerName, scoreLimit, occurrence, violationOccurrence }: CrapSite,
): void {
  const violationIdentity = `function:${entry.function}:occurrence:${String(violationOccurrence)}:source:${crapSourceHash(entry)}`;
  findings.push(
    ...crapFindings(
      [
        {
          path: entry.source,
          name: entry.function,
          identity: violationIdentity,
          ratchetKey: `function:${entry.function}:occurrence:${String(violationOccurrence)}:crap`,
          ...(entry.anchorHash === undefined
            ? {}
            : {
                anchor: `function:crap:text:${entry.anchorHash}`,
                declarationKey: `function:${entry.function}:declaration:${String(entry.declarationHash)}:crap`,
              }),
          line: entry.lines?.start,
          endLine: entry.lines?.end,
          crap: entry.crap,
        },
      ],
      { tool: analyzerName, limit: scoreLimit, unknownMessage: crapUnknownMessage(entry.source) },
    ),
  );
  const values = {
    complexity: entry.complexity,
    statementCoverage: entry.statementCoverage?.percent,
    branchCoverage: entry.branchCoverage?.percent,
    effectiveCoverage: entry.effectiveCoverage?.percent,
    crap: entry.crap,
  };
  for (const [metricName, value] of Object.entries(values)) {
    addMetric(findings, {
      analyzerName,
      rule: 'function-crap',
      path: entry.source,
      identity: `function:${entry.function}:occurrence:${String(occurrence)}:${metricName}`,
      message: `${metricName} for ${entry.function}`,
      metricName,
      value,
      symbol: entry.function,
      line: entry.lines?.start,
    });
  }
}

export function normalizeMutation(report: MutationReport, analyzerName: string): Finding[] {
  const mutants: NeutralMutant[] = [];
  const statusCounts = new Map<string, number>();
  const occurrences = new Map<string, number>();
  for (const [filePath, file] of Object.entries(report.files ?? {})) {
    collectFileMutants(file, { filePath, mutants, statusCounts, occurrences });
  }
  const findings = mutantFindings(mutants, { tool: analyzerName });
  for (const [status, value] of statusCounts) {
    addMetric(findings, {
      analyzerName,
      rule: 'mutation-summary',
      path: '.',
      identity: `status:${status}`,
      message: `${status} mutants`,
      metricName: status,
      value,
    });
  }
  return findings;
}

const CAUGHT_MUTANT_STATUSES = new Set(['Killed', 'Timeout']);

function uncoveredWhenUnreached(mutant: Mutant): Mutant {
  return mutant.status === 'Survived' ? { ...mutant, status: 'NoCoverage', coveredBy: [] } : mutant;
}

function isMutationReport(value: unknown): value is MutationReport {
  return typeof value === 'object' && value !== null;
}

export function withUnreachedMutantsUncovered(
  parsed: unknown,
  coverageAnalysis: unknown,
): MutationReport {
  if (!isMutationReport(parsed)) {
    throw new TypeError('The mutation report is not an object');
  }
  const report = parsed;
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
  file: ReportedFile,
  { filePath, mutants, statusCounts, occurrences }: MutantTally,
): void {
  for (const mutant of file.mutants ?? []) {
    const status = mutant.status ?? 'Unknown';
    statusCounts.set(status, (statusCounts.get(status) ?? 0) + 1);
    if (status !== 'Killed') {
      mutants.push(neutralMutant(mutant, { filePath, status, occurrences }));
    }
  }
}

function neutralMutant(
  mutant: Partial<Mutant>,
  { filePath, status, occurrences }: MutantSite,
): NeutralMutant {
  const semanticIdentity = [
    mutant.mutatorName ?? 'unknown',
    hash(mutant.replacement ?? ''),
    mutant.sourceHash ?? hash(filePath),
  ].join('|');
  const occurrence = nextOccurrence(occurrences, `${filePath}\0${status}\0${semanticIdentity}`);
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
