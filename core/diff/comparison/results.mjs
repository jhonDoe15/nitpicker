import {
  analyzerName,
  analyzerMetadata,
  policyHash,
  sortByToolAndPath,
} from '../reporting/report-model.mjs';

import { compareFindings } from './compare.mjs';

export function combineAnalyzerReports(context) {
  const { analyzers, baseRun, headRun, additionalToolErrors } = context;
  const toolErrors = [...additionalToolErrors, ...baseRun.toolErrors, ...headRun.toolErrors];
  const outcomes = analyzers.map((analyzer, index) =>
    compareAnalyzer({ ...context, analyzer, index, toolErrors }),
  );
  return buildReport({ ...context, outcomes, toolErrors });
}

function compareAnalyzer(context) {
  const { analyzer, index, baseRun, headRun, toolErrors } = context;
  const name = analyzerName(analyzer, index);
  const baseReport = baseRun.reports.get(name);
  const headReport = headRun.reports.get(name);
  const baseFindings = withoutEmittedToolErrors(baseReport?.findings ?? [], 'base', toolErrors);
  const headFindings = withoutEmittedToolErrors(headReport?.findings ?? [], 'head', toolErrors);
  const comparable =
    baseReport !== undefined &&
    headReport !== undefined &&
    !toolErrors.some((error) => error.tool === name);
  const result = comparable
    ? compareOrReportError({ ...context, name, baseFindings, headFindings })
    : emptyComparison();
  return {
    result,
    tool: toolSummary({ ...context, name, baseFindings, headFindings, result }),
  };
}

function compareOrReportError(context) {
  const { name, baseFindings, headFindings, toolErrors } = context;
  try {
    return compareFindings({
      baseFindings,
      headFindings,
      baseToHeadRenames: context.baseToHeadRenames,
      baseToHeadDirectories: context.baseToHeadDirectories,
      touchedCode: context.touchedCode,
    });
  } catch (error) {
    toolErrors.push({
      tool: name,
      snapshot: 'comparison',
      message: error instanceof Error ? error.message : String(error),
    });
    return emptyComparison();
  }
}

function toolSummary({ analyzer, name, baseRun, headRun, baseFindings, headFindings, result }) {
  const baseElapsedMs = baseRun.timings.get(name);
  const headElapsedMs = headRun.timings.get(name);
  const skippedBecause = headRun.skipped?.get(name) ?? baseRun.skipped?.get(name);
  return {
    name,
    ...(skippedBecause === undefined ? {} : { skippedBecause }),
    version: analyzerMetadata(analyzer, 'version'),
    configurationHash: analyzerMetadata(analyzer, 'configurationHash'),
    base: baseFindings.length,
    head: headFindings.length,
    new: result.newFindings.length,
    resolved: result.resolvedFindings.length,
    unchanged: result.unchangedFindings.length,
    changedMetrics: result.changedMetrics.length,
    baseElapsedMs,
    headElapsedMs,
    elapsedMs: (baseElapsedMs ?? 0) + (headElapsedMs ?? 0),
  };
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
  };
}

function withoutEmittedToolErrors(findings, snapshot, toolErrors) {
  return findings.filter((finding) => {
    if (finding.classification !== 'tool-error') {
      return true;
    }
    toolErrors.push({
      tool: finding.tool,
      snapshot,
      rule: finding.rule,
      path: finding.path,
      message: finding.message,
    });
    return false;
  });
}

function emptyComparison() {
  return {
    newFindings: [],
    resolvedFindings: [],
    unchangedFindings: [],
    changedMetrics: [],
  };
}
