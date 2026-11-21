import type { Finding } from '../../../static-checks/shared.mts';
import { DEFAULT_CRAP_SCORE_LIMIT, MESSAGES } from '../../../../../../shared/policy.mts';
import { hash } from '../../typed/repository.mts';
import type * as Report from '../../typed/reporting.mts';
import {
  crapFindings,
  metricFindings,
  occurrenceCounter,
  summaryMetrics,
} from '../../typed/reporting.mts';
import { appendAll } from '../../../../../../shared/lists/lists.mts';

const COMPOSITION_ROOT_FILE = /(?:^|\/)(?:main|server|composition-root)\.[cm]?[jt]sx?$/u;

export function crapUnknownMessage(sourcePath: string): string {
  return COMPOSITION_ROOT_FILE.test(sourcePath)
    ? MESSAGES.crapCoverageUnknown
    : MESSAGES.crapCoverageUnknownPlain;
}

export function normalizeCrap(
  report: Report.CrapReport,
  analyzerName: string,
  { scoreLimit }: { readonly scoreLimit: number } = { scoreLimit: DEFAULT_CRAP_SCORE_LIMIT },
): Finding[] {
  const findings = summaryMetrics(analyzerName, report.summary, 'crap');
  const nextOccurrence = occurrenceCounter();
  const nextViolation = occurrenceCounter();
  const functions = [...(report.functions ?? [])].sort(compareCrapSites);
  for (const entry of functions) {
    const occurrence = nextOccurrence(`${entry.source}\0${entry.function}`);
    const overLimit = !(
      typeof entry.crap === 'number' &&
      Number.isFinite(entry.crap) &&
      entry.crap < scoreLimit
    );
    const violationOccurrence = overLimit
      ? nextViolation(`${entry.source}\0${entry.function}\0${crapSourceHash(entry)}`)
      : occurrence;
    addCrapFunction(findings, entry, { analyzerName, scoreLimit, occurrence, violationOccurrence });
  }
  return findings;
}

function crapSourceHash(entry: Report.CrapEntry): string {
  return (
    entry.sourceHash ??
    hash(`${entry.source}:${String(entry.lines?.start)}:${String(entry.lines?.end)}`)
  );
}

function compareCrapSites(left: Report.CrapEntry, right: Report.CrapEntry): number {
  return (
    left.source.localeCompare(right.source) ||
    (left.lines?.start ?? 0) - (right.lines?.start ?? 0) ||
    (left.lines?.end ?? 0) - (right.lines?.end ?? 0) ||
    left.function.localeCompare(right.function)
  );
}

function addCrapFunction(
  findings: Finding[],
  entry: Report.CrapEntry,
  site: Report.CrapSite,
): void {
  appendAll(findings, crapViolationFindings(entry, site));
  appendAll(findings, crapMetricFindings(entry, site.analyzerName, site.occurrence));
}

function crapViolationFindings(
  entry: Report.CrapEntry,
  { analyzerName, scoreLimit, violationOccurrence }: Report.CrapSite,
): Finding[] {
  const violationIdentity = `function:${entry.function}:occurrence:${String(violationOccurrence)}:source:${crapSourceHash(entry)}`;
  return crapFindings(
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
  );
}

function crapMetricFindings(
  entry: Report.CrapEntry,
  analyzerName: string,
  occurrence: number,
): Finding[] {
  const values = {
    complexity: entry.complexity,
    statementCoverage: entry.statementCoverage?.percent,
    branchCoverage: entry.branchCoverage?.percent,
    effectiveCoverage: entry.effectiveCoverage?.percent,
    crap: entry.crap,
  };
  return Object.entries(values).flatMap(([metricName, value]) =>
    metricFindings({
      analyzerName,
      rule: 'function-crap',
      path: entry.source,
      identity: `function:${entry.function}:occurrence:${String(occurrence)}:${metricName}`,
      message: `${metricName} for ${entry.function}`,
      metricName,
      value,
      symbol: entry.function,
      line: entry.lines?.start,
    }),
  );
}
