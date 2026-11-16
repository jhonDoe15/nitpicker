import { planSnapshotSkips } from './plan.mjs';
import { layoutRoots } from './layout-roots.mts';
import { fieldOf, listOf, objectOf } from '../../../shared/values/readers.mts';
import type { AnalyzerRun } from '../execution/run-analyzers.mts';

type SkipPlan = {
  readonly skipped: readonly string[];
  readonly affected: readonly unknown[];
};

type SkipSettings = {
  readonly analyzers: readonly unknown[];
  readonly sharded?: unknown;
  readonly configOverrides?: unknown;
  readonly repositoryRoot: string;
  readonly headPolicy: unknown;
  readonly headProjectRoot: string;
};

type Snapshots = { readonly mergeBaseSha: string; readonly headSha: string };

type PolicySetup = { readonly policyChanges: unknown; readonly policyLoosenings: unknown };

function nameOf(analyzer: unknown): unknown {
  return fieldOf(analyzer, 'name');
}

export function skipPlanOf(settings: SkipSettings, comparison: Snapshots): SkipPlan {
  const everything = settings.analyzers.map(nameOf);
  const unplanned = { skipped: [], affected: everything };
  const wellFormed = settings.analyzers.every((analyzer) => typeof nameOf(analyzer) === 'string');
  if (!wellFormed || settings.sharded === true || listOf(settings.configOverrides).length > 0) {
    return unplanned;
  }
  return planSnapshotSkips({
    analyzers: settings.analyzers,
    roots: layoutRoots(settings),
    repositoryRoot: settings.repositoryRoot,
    mergeBaseSha: comparison.mergeBaseSha,
    headSha: comparison.headSha,
  });
}

export function endsEarly(skipPlan: SkipPlan, baseSetup: PolicySetup): boolean {
  return (
    skipPlan.affected.length === 0 &&
    skipPlan.skipped.length > 0 &&
    listOf(baseSetup.policyChanges).length === 0 &&
    listOf(baseSetup.policyLoosenings).length === 0
  );
}

export function withoutSkipped(
  analyzers: readonly unknown[],
  skipPlan: SkipPlan,
): readonly unknown[] {
  const skipped = new Set<unknown>(skipPlan.skipped);
  return skipped.size === 0
    ? analyzers
    : analyzers.filter((analyzer) => !skipped.has(nameOf(analyzer)));
}

function emptyRun(): AnalyzerRun {
  return {
    reports: new Map(),
    timings: new Map(),
    toolErrors: [],
    skipped: new Map(),
    metadata: new Map(),
  };
}

function reportsOf(run: unknown): ReadonlyMap<unknown, unknown> {
  const reports = fieldOf(run, 'reports');
  return reports instanceof Map ? reports : new Map();
}

export function carryBaseReports({
  baseRun,
  headRun,
  skipPlan,
  analyzers,
}: {
  readonly baseRun: unknown;
  readonly headRun: unknown;
  readonly skipPlan: SkipPlan;
  readonly analyzers: readonly unknown[];
}): { readonly analyzers: readonly unknown[]; readonly headRun: unknown } {
  if (skipPlan.skipped.length === 0) {
    return { analyzers, headRun };
  }
  const skipped = new Set<unknown>(skipPlan.skipped);
  const carried = new Map([...reportsOf(baseRun)].filter(([name]) => skipped.has(name)));
  const compared = analyzers.filter(
    (analyzer) => !skipped.has(nameOf(analyzer)) || carried.has(nameOf(analyzer)),
  );
  return {
    analyzers: compared,
    headRun: { ...objectOf(headRun), reports: new Map([...reportsOf(headRun), ...carried]) },
  };
}

export function runUnlessSkipped(
  analyzers: readonly unknown[],
  skipPlan: SkipPlan,
  run: (runnable: readonly unknown[]) => AnalyzerRun,
): AnalyzerRun {
  const runnable = withoutSkipped(analyzers, skipPlan);
  return runnable.length === 0 ? emptyRun() : run(runnable);
}
