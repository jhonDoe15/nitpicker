import { policyHash as hashOf, sortByToolAndPath as sorted } from '../reporting/report-model.mts';
import type { DeclaredMoves } from './moved-names/declared/move-types.mts';
import type { TouchedCode } from './model/finding-types.mts';
import { attachFixes } from './fixes/attach-fixes.mts';
import {
  type AnalyzerOutcome,
  type ComparisonRun,
  type FindingComparison,
  type Moves,
  compareAnalyzers,
} from './base-red/compare-analyzers.mts';
import { withoutSharedCrossToolOverlaps } from '../../../shared/findings/overlaps/cross-tool.mts';
import { type MetadataMap, mergeMetadata } from '../execution/report/analyzer-metadata.mts';
import { withCoChangeDependencies } from '../../../shared/history/co-change/dependencies/join.mts';
import { withSharedUnusedDirectives } from '../../../languages/typescript/adapters/eslint/merge/unused-directives.mts';
import { runProfileSummary } from '../../quick/summary.mts';
import { skippedSummary } from '../skipping/lines.mts';
import {
  type Scope,
  scopeNotes as scopedNotes,
  scopeOutcomes as scopedOutcomes,
  scopeSummary as scopedSummary,
} from '../../scope/scope-findings.mts';
import type { Finding, ReportEntry } from '../../../shared/values/findings.mts';
import { type LabelsOf, findingLabeler, labelCounts } from '../../labels/finding-labels.mts';
import { labeledFindings, labeledOutcomes, labelRun } from '../../labels/label-filter.mts';
import type { LabelFilter } from '../../labels/taxonomy.mts';
import { fieldOf, objectOf } from '../../../shared/values/readers.mts';
import { areaOf } from '../reporting/format/rule-groups/finding-areas.mts';

type ScopedOutcome = AnalyzerOutcome & { readonly outside?: number };

type ComparisonShas = Readonly<Record<string, unknown>>;

export type ReportContext = {
  readonly analyzers: readonly unknown[];
  readonly additionalToolErrors: readonly ReportEntry[];
  readonly comparison: ComparisonShas;
  readonly startedAt: number;
  readonly configOverrides: readonly unknown[];
  readonly notices: readonly unknown[];
  readonly baseToHeadRenames: Moves;
  readonly scope?: Scope | undefined;
  readonly quick?: unknown;
  readonly staged?: unknown;
  readonly labels?: LabelFilter | undefined;
  readonly labelsOf?: LabelsOf | undefined;
  readonly policyAnalyzers?: readonly unknown[] | undefined;
  readonly skippedAnalyzers?: readonly string[] | undefined;
};

export type CombineRequest = ReportContext & {
  readonly baseRun: ComparisonRun;
  readonly headRoot?: string;
  readonly fixRecipes?: unknown[] | undefined;
  readonly headRun: ComparisonRun;
  readonly baseToHeadDirectories?: Moves | undefined;
  readonly baseToHeadPackages?: Moves | undefined;
  readonly baseToHeadDeclared?: DeclaredMoves | undefined;
  readonly touchedCode?: TouchedCode | undefined;
  readonly policies?: { readonly base?: unknown; readonly head?: unknown } | undefined;
};

export type DiffReport = {
  readonly summary: { elapsedMs: number; readonly [field: string]: unknown };
  readonly newFindings: Finding[];
  readonly resolvedFindings: Finding[];
  readonly unchangedFindings: Finding[];
  readonly changedMetrics: ReportEntry[];
  readonly toolErrors: ReportEntry[];
  readonly notes: ReportEntry[];
  text?: unknown;
};

type BuildContext = Omit<ReportContext, 'additionalToolErrors'> & {
  readonly outcomes: readonly ScopedOutcome[];
  readonly metadata?: MetadataMap;
  readonly notes: ReportEntry[];
  readonly toolErrors: ReportEntry[];
  readonly hidden?: number;
};

const withFixes: (
  findings: Finding[],
  root: string | undefined,
  recipes: unknown[] | undefined,
) => Finding[] = attachFixes;
const skippedFields: (context: {
  readonly skippedAnalyzers?: readonly string[] | undefined;
}) => object = skippedSummary;
const withSharedDirectives: (run: ComparisonRun, analyzers: readonly unknown[]) => ComparisonRun =
  withSharedUnusedDirectives;
const profileSummary: (context: { readonly quick: unknown; readonly staged: unknown }) => object =
  runProfileSummary;

export function combineAnalyzerReports(context: CombineRequest): DiffReport {
  const { additionalToolErrors, policies = {} } = context;
  const deduplicated = withoutSharedCrossToolOverlaps(context);
  const baseRun = withSharedDirectives(
    withCoChangeDependencies(deduplicated.baseRun, objectOf(policies.base)),
    context.analyzers,
  );
  const headRun = withSharedDirectives(
    withCoChangeDependencies(deduplicated.headRun, objectOf(policies.head)),
    context.analyzers,
  );
  const toolErrors = [...additionalToolErrors, ...baseRun.toolErrors, ...headRun.toolErrors];
  const compared = compareAnalyzers({ ...context, baseRun, headRun, toolErrors });
  const labelsOf = context.labelsOf ?? findingLabeler({ areaOf });
  const labeled = labeledOutcomes(
    scopedOutcomes(compared.outcomes, context.scope),
    context.labels,
    labelsOf,
  );
  const notes = labeledFindings(
    scopedNotes(compared.notes, context.scope),
    context.labels,
    labelsOf,
  );
  const report = buildReport({
    ...context,
    outcomes: labeled.outcomes,
    notes: notes.findings,
    toolErrors,
    metadata: mergeMetadata(baseRun.metadata, headRun.metadata),
    hidden: labeled.hidden,
    labelsOf,
  });
  return {
    ...report,
    newFindings: withFixes(report.newFindings, context.headRoot, context.fixRecipes),
  };
}

export function noChangesReport(
  context: Omit<ReportContext, 'notices' | 'baseToHeadRenames'>,
): DiffReport {
  const report = buildReport({
    ...context,
    outcomes: [],
    notes: [],
    toolErrors: [...context.additionalToolErrors],
    notices: [],
    baseToHeadRenames: new Map(),
  });
  return { ...report, summary: { ...report.summary, noChanges: true } };
}

export function allSkippedReport(context: Parameters<typeof noChangesReport>[0]): DiffReport {
  const report = noChangesReport(context);
  const { noChanges, ...summary } = report.summary;
  return { ...report, summary: { ...summary, skippedAll: noChanges } };
}

const SKIPPED_CHECK_RULES = new Set(['race-not-checked', 'mutation-skipped']);

function skippedCheckNotices(outcomes: readonly ScopedOutcome[]): string[] {
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

function collect(
  outcomes: readonly ScopedOutcome[],
  key: Exclude<keyof FindingComparison, 'changedMetrics'>,
): Finding[] {
  return outcomes.flatMap(({ result }) => result[key]);
}

function exclusionsOf(analyzer: unknown): string[] {
  const exclusions = fieldOf(analyzer, 'exclusions');
  return Array.isArray(exclusions)
    ? exclusions.filter((exclusion) => typeof exclusion === 'string')
    : [];
}

function declaredExclusions(analyzers: readonly unknown[]): string[] {
  return [...new Set(analyzers.flatMap((analyzer) => exclusionsOf(analyzer)))].sort();
}

function labelCountsOf(findings: readonly Finding[], labelsOf: LabelsOf | undefined): object {
  if (findings.length === 0) {
    return {};
  }
  const labelsFor = labelsOf ?? findingLabeler({ areaOf });
  return { labelCounts: labelCounts(findings.map((finding) => ({ labels: labelsFor(finding) }))) };
}

function runAndScopeSummary(context: BuildContext, outcomes: readonly ScopedOutcome[]): object {
  const outside = outcomes.reduce((total, { outside: count }) => total + (count ?? 0), 0);
  return {
    ...profileSummary({ quick: context.quick, staged: context.staged }),
    ...scopedSummary(context.scope, outside),
    ...labelRun(context.labels, context.hidden ?? 0),
  };
}

function buildReport(context: BuildContext): DiffReport {
  const { analyzers, outcomes, toolErrors, comparison, startedAt } = context;
  const { configOverrides, notices } = context;
  const newFindings = collect(outcomes, 'newFindings');
  return {
    summary: {
      requestedBaseRef: comparison['requestedBaseRef'],
      resolvedBaseSha: comparison['resolvedBaseSha'],
      mergeBaseSha: comparison['mergeBaseSha'],
      headSha: comparison['headSha'],
      policyHash: hashOf(context.policyAnalyzers ?? analyzers, configOverrides, context.metadata),
      configOverrides,
      notices: [...notices, ...skippedCheckNotices(outcomes)],
      ...runAndScopeSummary(context, outcomes),
      ...skippedFields(context),
      tools: outcomes.map(({ tool }) => tool),
      exclusions: declaredExclusions(context.policyAnalyzers ?? analyzers),
      renamedPaths: context.baseToHeadRenames.size,
      elapsedMs: Date.now() - startedAt,
      overallStatus: toolErrors.length === 0 ? 'completed' : 'tool-error',
      newEnforceableFindings: newFindings.filter(
        (finding) => finding.classification === 'enforceable',
      ).length,
      ...labelCountsOf(
        newFindings.filter((finding) => finding.classification === 'enforceable'),
        context.labelsOf,
      ),
    },
    newFindings: sorted(newFindings),
    resolvedFindings: sorted(collect(outcomes, 'resolvedFindings')),
    unchangedFindings: sorted(collect(outcomes, 'unchangedFindings')),
    changedMetrics: sorted(outcomes.flatMap(({ result }) => result.changedMetrics)),
    toolErrors: sorted(toolErrors),
    notes: sorted(context.notes),
  };
}
