import path from 'node:path';
import {
  addMetric,
  hash,
  summaryMetrics,
  nextOccurrence,
  positiveInteger,
} from '../../../../../shared/rules/finding-helpers.mjs';
import { branchCoverageFindings } from '../../../../../shared/rules/branch-coverage.mjs';
import { DEFAULT_CRAP_SCORE_LIMIT, MESSAGES } from '../../../../../shared/policy.mjs';
import { crapFindings } from '../../../../../shared/rules/crap.mjs';
import { mutantFindings } from '../../../../../shared/rules/mutation.mjs';

export function normalizeCoverage(report, analyzerName, { projectRoot, testCount } = {}) {
  const findings = [];
  let coveredBranchOutcomes = 0;
  for (const [absolutePath, coverage] of Object.entries(report)) {
    const relativePath = path.relative(projectRoot, absolutePath).replaceAll('\\', '/');
    coveredBranchOutcomes += addFileCoverage(findings, coverage, { analyzerName, relativePath });
  }
  if (Number.isInteger(testCount) && testCount > 0) {
    addTestEfficiency(findings, analyzerName, { coveredBranchOutcomes, testCount });
  }
  return findings;
}

function addFileCoverage(findings, coverage, { analyzerName, relativePath }) {
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

function addTestEfficiency(findings, analyzerName, { coveredBranchOutcomes, testCount }) {
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

export function crapUnknownMessage(sourcePath) {
  return COMPOSITION_ROOT_FILE.test(sourcePath)
    ? MESSAGES.crapCoverageUnknown
    : MESSAGES.crapCoverageUnknownPlain;
}

export function normalizeCrap(
  report,
  analyzerName,
  { scoreLimit = DEFAULT_CRAP_SCORE_LIMIT } = {},
) {
  const findings = summaryMetrics(analyzerName, report.summary, 'crap');
  const occurrences = new Map();
  const violations = new Map();
  const functions = [...(report.functions ?? [])].sort(compareCrapSites);
  for (const entry of functions) {
    const occurrence = nextOccurrence(occurrences, `${entry.source}\0${entry.function}`);
    const overLimit = !(Number.isFinite(entry.crap) && entry.crap < scoreLimit);
    const violationOccurrence = overLimit
      ? nextOccurrence(violations, `${entry.source}\0${entry.function}\0${crapSourceHash(entry)}`)
      : occurrence;
    addCrapFunction(findings, entry, { analyzerName, scoreLimit, occurrence, violationOccurrence });
  }
  return findings;
}

function crapSourceHash(entry) {
  return (
    entry.sourceHash ??
    hash(`${entry.source}:${String(entry.lines?.start)}:${String(entry.lines?.end)}`)
  );
}

function compareCrapSites(left, right) {
  return (
    left.source.localeCompare(right.source) ||
    (left.lines?.start ?? 0) - (right.lines?.start ?? 0) ||
    (left.lines?.end ?? 0) - (right.lines?.end ?? 0) ||
    left.function.localeCompare(right.function)
  );
}

function addCrapFunction(
  findings,
  entry,
  { analyzerName, scoreLimit, occurrence, violationOccurrence },
) {
  const violationIdentity = `function:${entry.function}:occurrence:${String(violationOccurrence)}:source:${crapSourceHash(entry)}`;
  findings.push(
    ...crapFindings(
      [
        {
          path: entry.source,
          name: entry.function,
          identity: violationIdentity,
          ratchetKey: `function:${entry.function}:occurrence:${String(violationOccurrence)}:crap`,
          line: entry.lines?.start,
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

export function normalizeMutation(report, analyzerName) {
  const mutants = [];
  const statusCounts = new Map();
  const occurrences = new Map();
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

function collectFileMutants(file, { filePath, mutants, statusCounts, occurrences }) {
  for (const mutant of file.mutants ?? []) {
    const status = mutant.status ?? 'Unknown';
    statusCounts.set(status, (statusCounts.get(status) ?? 0) + 1);
    if (status !== 'Killed') {
      mutants.push(neutralMutant(mutant, { filePath, status, occurrences }));
    }
  }
}

function neutralMutant(mutant, { filePath, status, occurrences }) {
  const semanticIdentity = [
    mutant.mutatorName ?? 'unknown',
    hash(mutant.replacement ?? ''),
    mutant.sourceHash ?? hash(filePath),
  ].join('|');
  const occurrence = nextOccurrence(occurrences, `${filePath}\0${status}\0${semanticIdentity}`);
  return {
    path: filePath,
    identity: `${semanticIdentity}|occurrence:${String(occurrence)}`,
    status,
    ...(status === 'Ignored' ? { hiddenByComment: true } : {}),
    label: mutant.mutatorName ?? 'mutant',
    ...(mutant.functionName === undefined ? {} : { symbol: mutant.functionName }),
    line: mutant.location?.start?.line,
    ...(positiveInteger(mutant.location?.start?.column) === undefined
      ? {}
      : { column: mutant.location.start.column }),
    ...(typeof mutant.original === 'string' && mutant.original.length > 0
      ? { original: mutant.original }
      : {}),
    ...(mutant.replacement === undefined ? {} : { replacement: mutant.replacement }),
  };
}

function coveragePercent(values) {
  if (values.length === 0) {
    return 100;
  }
  return (values.filter((value) => value > 0).length / values.length) * 100;
}
