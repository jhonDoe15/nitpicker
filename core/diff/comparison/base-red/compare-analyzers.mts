import { compareFindings } from '../compare.mjs';
import { analyzerMetadata, analyzerName } from '../../reporting/report-model.mjs';
import {
  COMPILE_FAILED_SKIPPED_RULE,
  TESTS_FAILED_RULE,
  TESTS_FAILED_RULES,
} from '../../../../shared/rules/finding-helpers.mjs';
import { withoutAnsi } from '../../../../shared/messages/terminal/terminal-text.mjs';
import { baseFailuresOf, baseNoteOf, redBaseAnalyzers, unknownOnBaseFor } from './unknown-base.mjs';
import type { AnalyzerReport, Finding, ReportEntry } from '../../../../shared/values/findings.mts';

export type AnalyzerRun = {
  readonly reports: ReadonlyMap<string, AnalyzerReport>;
  readonly timings: ReadonlyMap<string, number>;
  readonly skipped?: ReadonlyMap<string, unknown> | undefined;
  readonly toolErrors: readonly ReportEntry[];
};

export type Moves = Map<string, string>;

export type ComparisonRequest = {
  readonly analyzers: readonly unknown[];
  readonly baseRun: AnalyzerRun;
  readonly headRun: AnalyzerRun;
  readonly toolErrors: ReportEntry[];
  readonly baseToHeadRenames?: Moves | undefined;
  readonly baseToHeadDirectories?: Moves | undefined;
  readonly touchedCode?: { readonly testsRemoved?: unknown } | undefined;
};

export type FindingComparison = {
  readonly newFindings: readonly Finding[];
  readonly resolvedFindings: readonly Finding[];
  readonly unchangedFindings: readonly Finding[];
  readonly changedMetrics: readonly Finding[];
};

export type AnalyzerOutcome = {
  readonly result: FindingComparison;
  readonly tool: ReportEntry;
};

type RedBase = ReadonlyMap<unknown, readonly Finding[]>;

type AnalyzerContext = ComparisonRequest & {
  readonly analyzer: unknown;
  readonly index: number;
  readonly notes: ReportEntry[];
  readonly redBase: RedBase;
};

type NamedContext = AnalyzerContext & { readonly name: string };

type ComparedContext = NamedContext & {
  readonly baseFindings: readonly Finding[];
  readonly headFindings: readonly Finding[];
  readonly unknownFailures: readonly Finding[] | undefined;
};

const findingsCompared: (request: {
  readonly baseFindings: readonly Finding[];
  readonly headFindings: readonly Finding[];
  readonly baseToHeadRenames: Moves | undefined;
  readonly baseToHeadDirectories: Moves | undefined;
  readonly touchedCode: unknown;
  readonly unknownOnBase: unknown;
}) => Readonly<Record<string, readonly Finding[]>> = compareFindings;
const metadataOf: (analyzer: unknown, property: string) => string = analyzerMetadata;
const nameOf: (analyzer: unknown, index: number) => string = analyzerName;
const plainText: (text: string) => string = withoutAnsi;
const redBaseOf: (request: {
  readonly names: readonly string[];
  readonly baseRun: AnalyzerRun;
  readonly headRun: AnalyzerRun;
}) => RedBase = redBaseAnalyzers;
const failuresOf: (request: {
  readonly name: string;
  readonly baseRun: AnalyzerRun;
  readonly headRun: AnalyzerRun;
  readonly redBase: RedBase;
}) => readonly Finding[] | undefined = baseFailuresOf;
const noteOf: (name: string, finding: Finding) => ReportEntry = baseNoteOf;
const unknownOnBase: (failures: readonly Finding[], touchedCode: unknown) => unknown =
  unknownOnBaseFor;
const testsFailedRules: readonly unknown[] = TESTS_FAILED_RULES;

export function compareAnalyzers(context: ComparisonRequest): {
  readonly outcomes: AnalyzerOutcome[];
  readonly notes: ReportEntry[];
} {
  const { analyzers, baseRun, headRun, toolErrors } = context;
  const names = analyzers.map((analyzer, index) => nameOf(analyzer, index));
  const redBase = redBaseOf({ names, baseRun, headRun });
  const notes: ReportEntry[] = [];
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

function removalNotes(failureNotes: readonly ReportEntry[]): ReportEntry[] {
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

function withoutConsequenceNotes(notes: ReportEntry[]): ReportEntry[] {
  return notes.some(({ rule }) => rule === TESTS_FAILED_RULE)
    ? notes.filter(({ rule }) => rule === TESTS_FAILED_RULE)
    : notes;
}

function baseFindingsOf({ name, baseRun, toolErrors, notes, redBase }: NamedContext): Finding[] {
  const findings = baseRun.reports.get(name)?.findings ?? [];
  const failures = redBase.get(name);
  if (failures === undefined) {
    return withoutEmittedToolErrors(findings, 'base', toolErrors);
  }
  notes.push(...failures.map((failure) => noteOf(name, failure)));
  return findings.filter((finding) => !failures.includes(finding));
}

function compareAnalyzer(context: AnalyzerContext): AnalyzerOutcome {
  const { analyzer, index, baseRun, headRun, toolErrors } = context;
  const name = nameOf(analyzer, index);
  const headReport = headRun.reports.get(name);
  const stopped = stoppedAtCompileErrors(headReport);
  const baseFindings = baseFindingsOf({ ...context, name });
  const headFindings = withoutEmittedToolErrors(headReport?.findings ?? [], 'head', toolErrors);
  const unknownFailures = failuresOf({ ...context, name });
  const comparable =
    (stopped || baseRun.reports.get(name) !== undefined || unknownFailures !== undefined) &&
    headReport !== undefined &&
    !toolErrors.some((error) => blocksComparison(error, name, stopped));
  const compared = stopped ? { baseFindings: [], unknownFailures: undefined } : {};
  const result = comparable
    ? compareOrReportError({
        ...context,
        name,
        baseFindings,
        headFindings,
        unknownFailures,
        ...compared,
      })
    : emptyComparison();
  return {
    result,
    tool: toolSummary({ ...context, name, baseFindings, headFindings, result, unknownFailures }),
  };
}

function stoppedAtCompileErrors(report: AnalyzerReport | undefined): boolean {
  return (report?.findings ?? []).some(
    ({ rule, classification }) =>
      rule === COMPILE_FAILED_SKIPPED_RULE && classification === 'tool-error',
  );
}

function blocksComparison(error: ReportEntry, name: string, stopped: boolean): boolean {
  if (error.tool !== name) {
    return false;
  }
  if (!stopped) {
    return true;
  }
  const baseTestsFailed = error.snapshot === 'base' && testsFailedRules.includes(error.rule);
  return error.rule !== COMPILE_FAILED_SKIPPED_RULE && !baseTestsFailed;
}

function compareOrReportError(context: ComparedContext): FindingComparison {
  const { name, baseFindings, headFindings, toolErrors, unknownFailures } = context;
  try {
    const result = findingsCompared({
      baseFindings,
      headFindings,
      baseToHeadRenames: context.baseToHeadRenames,
      baseToHeadDirectories: context.baseToHeadDirectories,
      touchedCode: context.touchedCode,
      unknownOnBase:
        unknownFailures === undefined
          ? undefined
          : unknownOnBase(unknownFailures, context.touchedCode),
    });
    return {
      newFindings: withoutEmittedToolErrors(result['newFindings'] ?? [], 'head', toolErrors),
      resolvedFindings: result['resolvedFindings'] ?? [],
      unchangedFindings: result['unchangedFindings'] ?? [],
      changedMetrics: result['changedMetrics'] ?? [],
    };
  } catch (error) {
    toolErrors.push({
      tool: name,
      snapshot: 'comparison',
      message: plainText(error instanceof Error ? error.message : String(error)),
    });
    return emptyComparison();
  }
}

function toolSummary(
  context: ComparedContext & { readonly result: FindingComparison },
): ReportEntry {
  const { analyzer, name, baseRun, headRun, baseFindings, headFindings, result } = context;
  const baseElapsedMs = baseRun.timings.get(name);
  const headElapsedMs = headRun.timings.get(name);
  const skippedBecause =
    headRun.skipped?.get(name) ??
    (context.unknownFailures === undefined ? baseRun.skipped?.get(name) : undefined);
  return {
    name,
    ...(skippedBecause === undefined ? {} : { skippedBecause }),
    version: metadataOf(analyzer, 'version'),
    configurationHash: metadataOf(analyzer, 'configurationHash'),
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

function withoutEmittedToolErrors(
  findings: readonly Finding[],
  snapshot: string,
  toolErrors: ReportEntry[],
): Finding[] {
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

function emptyComparison(): FindingComparison {
  return {
    newFindings: [],
    resolvedFindings: [],
    unchangedFindings: [],
    changedMetrics: [],
  };
}
