import { policyHash, sortByToolAndPath } from '../reporting/report-model.mjs';
import {
  isPolicyChangeAccepted,
  policyDigest,
  policyFindings,
} from '../reporting/review/policy-findings.mjs';
import { compareAnalyzers } from './base-red/compare-analyzers.mjs';
import { withoutSharedCrossToolOverlaps } from '../../../shared/findings/overlaps/cross-tool.mjs';
import { withCoChangeDependencies } from '../../../shared/history/co-change/dependencies/join.mjs';
import { runProfileSummary } from '../../quick/summary.mjs';
import { skippedSummary } from '../skipping/lines.mjs';
import { scopeNotes, scopeOutcomes, scopeSummary } from '../../scope/scope-findings.mjs';

export function combineAnalyzerReports(context) {
  const { additionalToolErrors, policies = {} } = context;
  const deduplicated = withoutSharedCrossToolOverlaps(context);
  const baseRun = withCoChangeDependencies(deduplicated.baseRun, policies.base);
  const headRun = withCoChangeDependencies(deduplicated.headRun, policies.head);
  const toolErrors = [...additionalToolErrors, ...baseRun.toolErrors, ...headRun.toolErrors];
  const compared = compareAnalyzers({ ...context, baseRun, headRun, toolErrors });
  const outcomes = scopeOutcomes(compared.outcomes, context.scope);
  const notes = scopeNotes(compared.notes, context.scope);
  return buildReport({ ...context, outcomes, notes, toolErrors });
}

export function noChangesReport(context) {
  const report = buildReport({
    ...context,
    outcomes: [],
    notes: [],
    toolErrors: context.additionalToolErrors,
    policyChanges: [],
    policyLoosenings: [],
    notices: [],
    baseToHeadRenames: new Map(),
    reportsPolicy: false,
  });
  return { ...report, summary: { ...report.summary, noChanges: true } };
}

export function allSkippedReport(context) {
  const report = noChangesReport(context);
  const { noChanges, ...summary } = report.summary;
  return { ...report, summary: { ...summary, skippedAll: noChanges } };
}

const SKIPPED_CHECK_RULES = new Set(['race-not-checked', 'mutation-skipped']);

function skippedCheckNotices(outcomes) {
  const findings = [...collect(outcomes, 'newFindings'), ...collect(outcomes, 'unchangedFindings')];
  return [
    ...new Set(
      findings
        .filter(
          ({ rule, classification }) =>
            classification === 'descriptive' && SKIPPED_CHECK_RULES.has(rule),
        )
        .map(({ tool, rule, message }) => `${tool}/${rule}: ${message}`),
    ),
  ];
}

function collect(outcomes, key) {
  return outcomes.flatMap(({ result }) => result[key]);
}

function declaredExclusions(analyzers) {
  return [
    ...new Set(
      analyzers.flatMap((analyzer) =>
        typeof analyzer === 'object' && analyzer !== null && Array.isArray(analyzer.exclusions)
          ? analyzer.exclusions.filter((exclusion) => typeof exclusion === 'string')
          : [],
      ),
    ),
  ].sort();
}

function policyReview(context, digest) {
  const { policyLoosenings, acceptPolicyChange, comparison } = context;
  const acceptance = { acceptedDigest: acceptPolicyChange, headSha: comparison.headSha };
  const kinds = context.policyKinds;
  return {
    findings: context.reportsPolicy
      ? policyFindings(policyLoosenings, digest, { ...acceptance, kinds })
      : [],
    accepted: isPolicyChangeAccepted(policyLoosenings, digest, acceptance),
  };
}

function runAndScopeSummary(context, outcomes) {
  const outside = outcomes.reduce((total, { outside: count }) => total + count, 0);
  return { ...runProfileSummary(context), ...scopeSummary(context.scope, outside) };
}

function buildReport(context) {
  const { analyzers, outcomes, toolErrors, comparison, startedAt } = context;
  const { configOverrides, policyChanges, policyLoosenings, notices } = context;
  const digest = context.policyDigest ?? policyDigest({ loosenings: policyLoosenings });
  const review = policyReview(context, digest);
  const newFindings = [...collect(outcomes, 'newFindings'), ...review.findings];
  return {
    summary: {
      requestedBaseRef: comparison.requestedBaseRef,
      resolvedBaseSha: comparison.resolvedBaseSha,
      mergeBaseSha: comparison.mergeBaseSha,
      headSha: comparison.headSha,
      policyHash: policyHash(context.policyAnalyzers ?? analyzers, configOverrides),
      configOverrides,
      policyChanges,
      policyLoosenings,
      ...(policyLoosenings.length === 0 ? {} : { policyDigest: digest }),
      policyChangeAccepted: review.accepted,
      ...(context.policyAcceptanceSource === undefined
        ? {}
        : { policyAcceptanceSource: context.policyAcceptanceSource }),
      notices: [...notices, ...skippedCheckNotices(outcomes)],
      ...runAndScopeSummary(context, outcomes),
      ...skippedSummary(context),
      tools: outcomes.map(({ tool }) => tool),
      exclusions: declaredExclusions(context.policyAnalyzers ?? analyzers),
      renamedPaths: context.baseToHeadRenames.size,
      elapsedMs: Date.now() - startedAt,
      overallStatus: toolErrors.length === 0 ? 'completed' : 'tool-error',
      newEnforceableFindings: newFindings.filter(
        (finding) => finding.classification === 'enforceable',
      ).length,
    },
    newFindings: sortByToolAndPath(newFindings),
    resolvedFindings: sortByToolAndPath(collect(outcomes, 'resolvedFindings')),
    unchangedFindings: sortByToolAndPath(collect(outcomes, 'unchangedFindings')),
    changedMetrics: sortByToolAndPath(collect(outcomes, 'changedMetrics')),
    toolErrors: sortByToolAndPath(toolErrors),
    notes: sortByToolAndPath(context.notes),
  };
}
