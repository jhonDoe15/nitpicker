import { policyHash, sortByToolAndPath } from '../reporting/report-model.mjs';
import { compareAnalyzers } from './base-red/compare-analyzers.mjs';

export function combineAnalyzerReports(context) {
  const { baseRun, headRun, additionalToolErrors } = context;
  const toolErrors = [...additionalToolErrors, ...baseRun.toolErrors, ...headRun.toolErrors];
  const { outcomes, notes } = compareAnalyzers({ ...context, toolErrors });
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
  const { analyzers, outcomes, toolErrors, comparison, startedAt, configOverrides } = context;
  const newFindings = collect(outcomes, 'newFindings');
  return {
    summary: {
      requestedBaseRef: comparison.requestedBaseRef,
      resolvedBaseSha: comparison.resolvedBaseSha,
      mergeBaseSha: comparison.mergeBaseSha,
      headSha: comparison.headSha,
      policyHash: policyHash(analyzers, configOverrides),
      configOverrides,
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
