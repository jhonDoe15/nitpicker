import { policyHash, sortByToolAndPath } from '../reporting/report-model.mjs';
import {
  isPolicyChangeAccepted,
  policyDigest,
  policyFindings,
} from '../reporting/review/policy-findings.mjs';
import { compareAnalyzers } from './base-red/compare-analyzers.mjs';
import { scopeNotes, scopeOutcomes, scopeSummary } from '../../scope/scope-findings.mjs';

export function combineAnalyzerReports(context) {
  const { baseRun, headRun, additionalToolErrors } = context;
  const toolErrors = [...additionalToolErrors, ...baseRun.toolErrors, ...headRun.toolErrors];
  const compared = compareAnalyzers({ ...context, toolErrors });
  const outcomes = scopeOutcomes(compared.outcomes, context.scope);
  const notes = scopeNotes(compared.notes, context.scope);
  return buildReport({ ...context, outcomes, notes, toolErrors });
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

function buildReport(context) {
  const { analyzers, outcomes, toolErrors, comparison, startedAt } = context;
  const { configOverrides, policyChanges, policyLoosenings, acceptPolicyChange, notices } = context;
  const digest = context.policyDigest ?? policyDigest({ loosenings: policyLoosenings });
  const newFindings = [
    ...collect(outcomes, 'newFindings'),
    ...(context.reportsPolicy
      ? policyFindings(policyLoosenings, digest, {
          acceptedDigest: acceptPolicyChange,
          kinds: context.policyKinds,
        })
      : []),
  ];
  return {
    summary: {
      requestedBaseRef: comparison.requestedBaseRef,
      resolvedBaseSha: comparison.resolvedBaseSha,
      mergeBaseSha: comparison.mergeBaseSha,
      headSha: comparison.headSha,
      policyHash: policyHash(analyzers, configOverrides),
      configOverrides,
      policyChanges,
      policyLoosenings,
      ...(policyLoosenings.length === 0 ? {} : { policyDigest: digest }),
      policyChangeAccepted: isPolicyChangeAccepted(policyLoosenings, digest, acceptPolicyChange),
      ...(context.policyAcceptanceSource === undefined
        ? {}
        : { policyAcceptanceSource: context.policyAcceptanceSource }),
      notices,
      ...scopeSummary(
        context.scope,
        outcomes.reduce((total, { outside }) => total + outside, 0),
      ),
      tools: outcomes.map(({ tool }) => tool),
      exclusions: declaredExclusions(analyzers),
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
