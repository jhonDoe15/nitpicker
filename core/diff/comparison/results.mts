import { policyHash as hashOf, sortByToolAndPath as sorted } from '../reporting/report-model.mts';
import {
  isPolicyChangeAccepted,
  policyDigest,
  policyFindings,
} from '../reporting/review/policy-findings.mts';
import { attachFixes } from './fixes/attach-fixes.mts';
import {
  type AnalyzerOutcome,
  type AnalyzerRun,
  type FindingComparison,
  type Moves,
  compareAnalyzers,
} from './base-red/compare-analyzers.mts';
import { type MetadataMap, mergeMetadata } from '../execution/report/analyzer-metadata.mts';
import { withCoChangeDependencies } from '../../../shared/history/co-change/dependencies/join.mjs';
import { withSharedUnusedDirectives } from '../../../languages/typescript/adapters/eslint/merge/unused-directives.mjs';
import { runProfileSummary } from '../../quick/summary.mts';
import { scopeNotes, scopeOutcomes, scopeSummary } from '../../scope/scope-findings.mjs';
import type { Finding, ReportEntry } from '../../../shared/values/findings.mts';
import { fieldOf, fieldsOf, objectOf, textOf, textsOf } from '../../../shared/values/readers.mts';

type ScopedOutcome = AnalyzerOutcome & { readonly outside?: number };

type ComparisonShas = Readonly<Record<string, unknown>>;

export type ReportContext = {
  readonly analyzers: readonly unknown[];
  readonly additionalToolErrors: readonly ReportEntry[];
  readonly comparison: ComparisonShas;
  readonly startedAt: number;
  readonly configOverrides: readonly unknown[];
  readonly policyChanges: unknown;
  readonly policyLoosenings: readonly unknown[];
  readonly notices: readonly unknown[];
  readonly baseToHeadRenames: Moves;
  readonly policyDigest?: unknown;
  readonly policyKinds?: unknown;
  readonly acceptPolicyChange?: unknown;
  readonly policyAcceptanceSource?: unknown;
  readonly reportsPolicy: boolean;
  readonly scope?: unknown;
  readonly quick?: unknown;
  readonly staged?: unknown;
};

export type CombineRequest = ReportContext & {
  readonly baseRun: unknown;
  readonly headRoot?: string;
  readonly fixRecipes?: unknown[] | undefined;
  readonly headRun: unknown;
  readonly baseToHeadDirectories?: Moves | undefined;
  readonly touchedCode?: { readonly testsRemoved?: unknown } | undefined;
  readonly policies?: { readonly base?: unknown; readonly head?: unknown } | undefined;
};

export type DiffReport = {
  readonly summary: { elapsedMs: number; readonly [field: string]: unknown };
  readonly newFindings: Finding[];
  readonly resolvedFindings: Finding[];
  readonly unchangedFindings: Finding[];
  readonly changedMetrics: Finding[];
  readonly toolErrors: ReportEntry[];
  readonly notes: ReportEntry[];
  text?: unknown;
  fixPlans?: unknown[];
};

type BuildContext = Omit<ReportContext, 'additionalToolErrors'> & {
  readonly outcomes: readonly ScopedOutcome[];
  readonly metadata?: MetadataMap;
  readonly notes: ReportEntry[];
  readonly toolErrors: ReportEntry[];
};

const withFixes: (
  findings: Finding[],
  root: string | undefined,
  recipes: unknown[] | undefined,
) => Finding[] = attachFixes;
const withDependencies: (run: unknown, policy?: object) => AnalyzerRun = withCoChangeDependencies;
const withSharedDirectives: (run: AnalyzerRun, analyzers: readonly unknown[]) => AnalyzerRun =
  withSharedUnusedDirectives;
const profileSummary: (context: { readonly quick: unknown; readonly staged: unknown }) => object =
  runProfileSummary;
const scopedOutcomes: (
  outcomes: readonly AnalyzerOutcome[],
  scope: unknown,
) => readonly ScopedOutcome[] = scopeOutcomes;
const scopedNotes: (notes: readonly ReportEntry[], scope: unknown) => ReportEntry[] = scopeNotes;
const scopedSummary: (scope: unknown, outside: number) => object = scopeSummary;

export function combineAnalyzerReports(context: CombineRequest): DiffReport {
  const { additionalToolErrors, policies = {} } = context;
  const baseRun = withSharedDirectives(
    withDependencies(context.baseRun, objectOf(policies.base)),
    context.analyzers,
  );
  const headRun = withSharedDirectives(
    withDependencies(context.headRun, objectOf(policies.head)),
    context.analyzers,
  );
  const toolErrors = [...additionalToolErrors, ...baseRun.toolErrors, ...headRun.toolErrors];
  const compared = compareAnalyzers({ ...context, baseRun, headRun, toolErrors });
  const outcomes = scopedOutcomes(compared.outcomes, context.scope);
  const notes = scopedNotes(compared.notes, context.scope);
  const metadata = mergeMetadata(baseRun.metadata, headRun.metadata);
  const report = buildReport({ ...context, outcomes, notes, toolErrors, metadata });
  return {
    ...report,
    newFindings: withFixes(report.newFindings, context.headRoot, context.fixRecipes),
  };
}

export function noChangesReport(
  context: Omit<
    ReportContext,
    'policyChanges' | 'policyLoosenings' | 'notices' | 'baseToHeadRenames' | 'reportsPolicy'
  >,
): DiffReport {
  const report = buildReport({
    ...context,
    outcomes: [],
    notes: [],
    toolErrors: [...context.additionalToolErrors],
    policyChanges: [],
    policyLoosenings: [],
    notices: [],
    baseToHeadRenames: new Map(),
    reportsPolicy: false,
  });
  return { ...report, summary: { ...report.summary, noChanges: true } };
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

function collect(outcomes: readonly ScopedOutcome[], key: keyof FindingComparison): Finding[] {
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

function optionalText(value: unknown): string | undefined {
  return value === undefined ? undefined : textOf(value);
}

function policyReview(
  context: BuildContext,
  digest: string,
): { readonly findings: Finding[]; readonly accepted: boolean } {
  const { acceptPolicyChange, comparison } = context;
  const loosenings = textsOf(context.policyLoosenings);
  const acceptance = {
    acceptedDigest: optionalText(acceptPolicyChange),
    headSha: optionalText(comparison['headSha']),
  };
  const kinds = Object.fromEntries(
    Object.entries(fieldsOf(context.policyKinds)).map(([name, kind]) => [name, textOf(kind)]),
  );
  return {
    findings: context.reportsPolicy
      ? policyFindings(loosenings, digest, { ...acceptance, kinds })
      : [],
    accepted: isPolicyChangeAccepted(loosenings, digest, acceptance),
  };
}

function runAndScopeSummary(context: BuildContext, outcomes: readonly ScopedOutcome[]): object {
  const outside = outcomes.reduce((total, { outside: count }) => total + (count ?? 0), 0);
  return {
    ...profileSummary({ quick: context.quick, staged: context.staged }),
    ...scopedSummary(context.scope, outside),
  };
}

function buildReport(context: BuildContext): DiffReport {
  const { analyzers, outcomes, toolErrors, comparison, startedAt } = context;
  const { configOverrides, policyChanges, policyLoosenings, notices } = context;
  const digest = textOf(
    context.policyDigest ?? policyDigest({ loosenings: textsOf(policyLoosenings) }),
  );
  const review = policyReview(context, digest);
  const newFindings = [...collect(outcomes, 'newFindings'), ...review.findings];
  return {
    summary: {
      requestedBaseRef: comparison['requestedBaseRef'],
      resolvedBaseSha: comparison['resolvedBaseSha'],
      mergeBaseSha: comparison['mergeBaseSha'],
      headSha: comparison['headSha'],
      policyHash: hashOf(analyzers, configOverrides, context.metadata),
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
      tools: outcomes.map(({ tool }) => tool),
      exclusions: declaredExclusions(analyzers),
      renamedPaths: context.baseToHeadRenames.size,
      elapsedMs: Date.now() - startedAt,
      overallStatus: toolErrors.length === 0 ? 'completed' : 'tool-error',
      newEnforceableFindings: newFindings.filter(
        (finding) => finding.classification === 'enforceable',
      ).length,
    },
    newFindings: sorted(newFindings),
    resolvedFindings: sorted(collect(outcomes, 'resolvedFindings')),
    unchangedFindings: sorted(collect(outcomes, 'unchangedFindings')),
    changedMetrics: sorted(collect(outcomes, 'changedMetrics')),
    toolErrors: sorted(toolErrors),
    notes: sorted(context.notes),
  };
}
