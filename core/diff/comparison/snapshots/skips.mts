import {
  carryBaseReports,
  endsEarly,
  runUnlessSkipped,
  skipPlanOf,
  withoutSkipped,
} from '../../skipping/apply.mjs';
import type { AnalyzerRun } from '../../execution/run-analyzers.mts';
import type { BaseSetup, Settings } from './diff-types.mts';
import type { SkipPlan } from './run-types.mts';
import type { Comparison } from './layout.mts';

export const planOf: (settings: Settings, comparison: Comparison) => SkipPlan = skipPlanOf;
export const stopsEarly: (plan: SkipPlan, setup: BaseSetup) => boolean = endsEarly;
export const runnableOf: (analyzers: readonly unknown[], plan: SkipPlan) => readonly unknown[] =
  withoutSkipped;
export const carried: (request: {
  readonly analyzers: readonly unknown[];
  readonly baseRun: unknown;
  readonly headRun: unknown;
  readonly skipPlan: SkipPlan;
}) => { readonly analyzers: readonly unknown[]; readonly headRun: unknown } = carryBaseReports;
export const unlessSkipped: (
  analyzers: readonly unknown[],
  plan: SkipPlan,
  run: (analyzers: readonly unknown[]) => AnalyzerRun,
) => AnalyzerRun = runUnlessSkipped;
