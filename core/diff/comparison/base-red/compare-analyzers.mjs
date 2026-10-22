import { compareFindings } from '../compare.mjs';
import { analyzerMetadata, analyzerName } from '../../reporting/report-model.mjs';
import { TESTS_FAILED_RULE } from '../../../../shared/rules/finding-helpers.mjs';
import { baseFailuresOf, baseNoteOf, redBaseAnalyzers, unknownOnBaseFor } from './unknown-base.mjs';

export function compareAnalyzers(context) {
  const { analyzers, baseRun, headRun, toolErrors } = context;
  const names = analyzers.map((analyzer, index) => analyzerName(analyzer, index));
  const redBase = redBaseAnalyzers({ names, baseRun, headRun });
  const notes = [];
  const outcomes = analyzers.map((analyzer, index) =>
    compareAnalyzer({ ...context, analyzer, index, toolErrors, notes, redBase }),
  );
  const failureNotes = withoutConsequenceNotes(notes);
  return {
    outcomes,
    notes:
      context.touchedCode?.testsRemoved === true
        ? [...failureNotes, ...removalNotes(failureNotes)]
        : failureNotes,
  };
}

const TESTS_REMOVED_MESSAGE = [
  'The change removes tests, so the base cannot show what they covered:',
  'every coverage, CRAP, mutation, slow-test and test-console result of the head counts as new.',
].join(' ');

function removalNotes(failureNotes) {
  return failureNotes.length === 0
    ? []
    : [
        {
          tool: 'nitpicker',
          snapshot: 'head',
          rule: 'tests-removed',
          path: '.',
          message: TESTS_REMOVED_MESSAGE,
        },
      ];
}

function withoutConsequenceNotes(notes) {
  return notes.some(({ rule }) => rule === TESTS_FAILED_RULE)
    ? notes.filter(({ rule }) => rule === TESTS_FAILED_RULE)
    : notes;
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
  const unknownFailures = baseFailuresOf({ ...context, name });
  const comparable =
    (baseRun.reports.get(name) !== undefined || unknownFailures !== undefined) &&
    headReport !== undefined &&
    !toolErrors.some((error) => error.tool === name);
  const result = comparable
    ? compareOrReportError({ ...context, name, baseFindings, headFindings, unknownFailures })
    : emptyComparison();
  return {
    result,
    tool: toolSummary({ ...context, name, baseFindings, headFindings, result, unknownFailures }),
  };
}

function compareOrReportError(context) {
  const { name, baseFindings, headFindings, toolErrors, unknownFailures } = context;
  try {
    return compareFindings({
      baseFindings,
      headFindings,
      baseToHeadRenames: context.baseToHeadRenames,
      baseToHeadDirectories: context.baseToHeadDirectories,
      touchedCode: context.touchedCode,
      unknownOnBase:
        unknownFailures === undefined
          ? undefined
          : unknownOnBaseFor(unknownFailures, context.touchedCode),
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
    headRun.skipped?.get(name) ??
    (context.unknownFailures === undefined ? baseRun.skipped?.get(name) : undefined);
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

function emptyComparison() {
  return {
    newFindings: [],
    resolvedFindings: [],
    unchangedFindings: [],
    changedMetrics: [],
  };
}
