import { compareFindings } from '../compare.mjs';
import { analyzerMetadata, analyzerName } from '../report-model.mjs';
import {
  baseNoteOf,
  isBaseUnknown,
  isTestResultFinding,
  redBaseAnalyzers,
} from './unknown-base.mjs';

export function compareAnalyzers(context) {
  const { analyzers, baseRun, headRun, toolErrors } = context;
  const names = analyzers.map((analyzer, index) => analyzerName(analyzer, index));
  const redBase = redBaseAnalyzers({ names, baseRun, headRun });
  const notes = [];
  const outcomes = analyzers.map((analyzer, index) =>
    compareAnalyzer({ ...context, analyzer, index, toolErrors, notes, redBase }),
  );
  return { outcomes, notes };
}

function baseFindingsOf({ name, baseRun, toolErrors, notes, redBase }) {
  const findings = baseRun.reports.get(name)?.findings ?? [];
  const failures = redBase.get(name);
  if (failures === undefined) {
    return withoutEmittedToolErrors(findings, 'base', toolErrors);
  }
  notes.push(...failures.map((failure) => baseNoteOf(name, failure)));
  return findings.filter((finding) => !failures.includes(finding));
}

function compareAnalyzer(context) {
  const { analyzer, index, baseRun, headRun, toolErrors } = context;
  const name = analyzerName(analyzer, index);
  const headReport = headRun.reports.get(name);
  const baseFindings = baseFindingsOf({ ...context, name });
  const headFindings = withoutEmittedToolErrors(headReport?.findings ?? [], 'head', toolErrors);
  const baseUnknown = isBaseUnknown({ ...context, name });
  const comparable =
    (baseRun.reports.get(name) !== undefined || baseUnknown) &&
    headReport !== undefined &&
    !toolErrors.some((error) => error.tool === name);
  const result = comparable
    ? compareOrReportError({ ...context, name, baseFindings, headFindings, baseUnknown })
    : emptyComparison();
  return {
    result,
    tool: toolSummary({ ...context, name, baseFindings, headFindings, result, baseUnknown }),
  };
}

function compareOrReportError(context) {
  const { name, baseFindings, headFindings, toolErrors, baseUnknown } = context;
  try {
    return compareFindings({
      baseFindings,
      headFindings,
      baseToHeadRenames: context.baseToHeadRenames,
      baseToHeadDirectories: context.baseToHeadDirectories,
      touchedCode: context.touchedCode,
      unknownOnBase: baseUnknown ? isTestResultFinding : undefined,
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

function toolSummary(context) {
  const { analyzer, name, baseRun, headRun, baseFindings, headFindings, result } = context;
  const baseElapsedMs = baseRun.timings.get(name);
  const headElapsedMs = headRun.timings.get(name);
  const skippedBecause =
    headRun.skipped?.get(name) ?? (context.baseUnknown ? undefined : baseRun.skipped?.get(name));
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

export function emptyComparison() {
  return {
    newFindings: [],
    resolvedFindings: [],
    unchangedFindings: [],
    changedMetrics: [],
  };
}
