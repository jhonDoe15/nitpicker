import { policyHash, sortByToolAndPath } from '../reporting/report-model.mjs';
import {
  isPolicyChangeAccepted,
  policyDigest,
  policyFindings,
} from '../reporting/review/policy-findings.mjs';
import {
  type AnalyzerOutcome,
  type AnalyzerRun,
  type FindingComparison,
  type Moves,
  compareAnalyzers,
} from './base-red/compare-analyzers.mts';
import { withCoChangeDependencies } from '../../../shared/history/co-change/dependencies/join.mjs';
import { runProfileSummary } from '../../quick/summary.mjs';
import { scopeNotes, scopeOutcomes, scopeSummary } from '../../scope/scope-findings.mjs';
import type { Finding, ReportEntry } from '../../../shared/values/findings.mts';
import { fieldOf, objectOf } from '../../../shared/values/readers.mts';

type ScopedOutcome = AnalyzerOutcome & { readonly outside?: number };

type ComparisonShas = Readonly<Record<string, unknown>>;

export type ReportContext = {
  readonly analyzers: readonly unknown[];
  readonly additionalToolErrors: readonly ReportEntry[];
  readonly comparison: ComparisonShas;
  readonly startedAt: number;
  readonly configOverrides: unknown[];
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
};

type BuildContext = Omit<ReportContext, 'additionalToolErrors'> & {
  readonly outcomes: readonly ScopedOutcome[];
  readonly notes: ReportEntry[];
  readonly toolErrors: ReportEntry[];
};

const hashOf: (analyzers: readonly unknown[], configOverrides: unknown[]) => string = policyHash;
const sorted: <T>(entries: T[]) => T[] = sortByToolAndPath;
const accepted: (
  loosenings: readonly unknown[],
  digest: unknown,
  acceptance: { readonly acceptedDigest: unknown; readonly headSha: unknown },
) => boolean = isPolicyChangeAccepted;
const digestOf: (request: { readonly loosenings: readonly unknown[] }) => string = policyDigest;
const loosenedFindings: (
  loosenings: readonly unknown[],
  digest: unknown,
  options: object,
) => Finding[] = policyFindings;
const withDependencies: (run: unknown, policy?: object) => AnalyzerRun = withCoChangeDependencies;
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
  const baseRun = withDependencies(context.baseRun, objectOf(policies.base));
  const headRun = withDependencies(context.headRun, objectOf(policies.head));
  const toolErrors = [...additionalToolErrors, ...baseRun.toolErrors, ...headRun.toolErrors];
  const compared = compareAnalyzers({ ...context, baseRun, headRun, toolErrors });
  const outcomes = scopedOutcomes(compared.outcomes, context.scope);
  const notes = scopedNotes(compared.notes, context.scope);
  return buildReport({ ...context, outcomes, notes, toolErrors });
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

function policyReview(
  context: BuildContext,
  digest: unknown,
): { readonly findings: Finding[]; readonly accepted: boolean } {
  const { policyLoosenings, acceptPolicyChange, comparison } = context;
  const acceptance = { acceptedDigest: acceptPolicyChange, headSha: comparison['headSha'] };
  const kinds = context.policyKinds;
  return {
    findings: context.reportsPolicy
      ? loosenedFindings(policyLoosenings, digest, { ...acceptance, kinds })
      : [],
    accepted: accepted(policyLoosenings, digest, acceptance),
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
  const digest = context.policyDigest ?? digestOf({ loosenings: policyLoosenings });
  const review = policyReview(context, digest);
  const newFindings = [...collect(outcomes, 'newFindings'), ...review.findings];
  return {
    summary: {
      requestedBaseRef: comparison['requestedBaseRef'],
      resolvedBaseSha: comparison['resolvedBaseSha'],
      mergeBaseSha: comparison['mergeBaseSha'],
      headSha: comparison['headSha'],
      policyHash: hashOf(analyzers, configOverrides),
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
