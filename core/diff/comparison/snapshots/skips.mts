import { endsEarly, runUnlessSkipped, skipPlanOf, withoutSkipped } from '../../skipping/apply.mts';
import type { AnalyzerRun } from '../../execution/run-analyzers.mts';
import type { Settings } from './diff-types.mts';
import type { SkipPlan } from './run-types.mts';
import type { Comparison } from './layout.mts';

export const planOf: (settings: Settings, comparison: Comparison) => SkipPlan = skipPlanOf;
export const stopsEarly: (plan: SkipPlan) => boolean = endsEarly;
export const runnableOf: (analyzers: readonly unknown[], plan: SkipPlan) => readonly unknown[] =
  withoutSkipped;
export { carryBaseReports as carried } from '../../skipping/apply.mts';
export const unlessSkipped: (
  analyzers: readonly unknown[],
  plan: SkipPlan,
  run: (analyzers: readonly unknown[]) => AnalyzerRun,
) => AnalyzerRun = runUnlessSkipped;
