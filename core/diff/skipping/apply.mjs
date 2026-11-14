import { planSnapshotSkips } from './plan.mjs';
import { layoutRoots } from './layout-roots.mjs';

export function skipPlanOf(settings, comparison) {
  const everything = settings.analyzers.map((analyzer) => analyzer?.name);
  const unplanned = { skipped: [], affected: everything };
  const wellFormed = settings.analyzers.every((analyzer) => typeof analyzer?.name === 'string');
  if (!wellFormed || settings.sharded === true || (settings.configOverrides ?? []).length > 0) {
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

export function endsEarly(skipPlan, baseSetup) {
  return (
    skipPlan.affected.length === 0 &&
    skipPlan.skipped.length > 0 &&
    baseSetup.policyChanges.length === 0 &&
    baseSetup.policyLoosenings.length === 0
  );
}

export function withoutSkipped(analyzers, skipPlan) {
  const skipped = new Set(skipPlan?.skipped ?? []);
  return skipped.size === 0 ? analyzers : analyzers.filter(({ name }) => !skipped.has(name));
}

function emptyRun() {
  return { reports: new Map(), timings: new Map(), toolErrors: [], skipped: new Map() };
}

export function carryBaseReports({ baseRun, headRun, skipPlan, analyzers }) {
  if (skipPlan.skipped.length === 0) {
    return { analyzers, headRun };
  }
  const skipped = new Set(skipPlan.skipped);
  const carried = new Map([...baseRun.reports].filter(([name]) => skipped.has(name)));
  const compared = analyzers.filter(({ name }) => !skipped.has(name) || carried.has(name));
  return {
    analyzers: compared,
    headRun: { ...headRun, reports: new Map([...headRun.reports, ...carried]) },
  };
}

export function runUnlessSkipped(analyzers, skipPlan, run) {
  const runnable = withoutSkipped(analyzers, skipPlan);
  return runnable.length === 0 ? emptyRun() : run(runnable);
}
