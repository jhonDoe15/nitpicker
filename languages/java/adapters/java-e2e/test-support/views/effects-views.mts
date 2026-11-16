import {
  effectsSummary as effectsSummaryUntyped,
  loopLines as loopLinesUntyped,
} from '../../../effects/test-support/effects-projects.mts';
import { runEngineOnSamples as runEngineOnSamplesUntyped } from '../../../effects/test-support/engine-samples.mts';
import type { JavaFinding } from '../../../typed/java-values.mts';

type EngineViolation = {
  readonly rule: string;
  readonly className: string;
  readonly fileName: string;
  readonly line: number;
  readonly firstLine: number;
  readonly method: string;
  readonly job?: string;
  readonly entity?: string;
  readonly column?: string;
  readonly flag?: string;
  readonly declared?: number;
  readonly total?: number;
};
type EngineFact = {
  readonly fileName: string;
  readonly verdict: string;
  readonly line: number;
  readonly kind: string;
  readonly form: string;
};
export type EngineReport = {
  readonly classes: number;
  readonly skipped: number;
  readonly unreadableLibraries: number;
  readonly unresolved: { readonly supertypes: number };
  readonly violations: readonly EngineViolation[];
  readonly covered: readonly EngineFact[];
  readonly degraded: unknown;
};

export const effectsSummary: (report: { violations: readonly unknown[] }) => string[] =
  effectsSummaryUntyped;
export const loopLines: (findings: readonly JavaFinding[], tool: string, file: string) => number[] =
  loopLinesUntyped;
function isEngineReport(value: unknown): value is EngineReport {
  return typeof value === 'object' && value !== null && 'violations' in value && 'covered' in value;
}

export function runEngineOnSamples(options: { maven: string | undefined }): {
  work: string;
  report: EngineReport;
} {
  const { work, report } = runEngineOnSamplesUntyped(
    options.maven === undefined ? {} : { maven: options.maven },
  );
  if (!isEngineReport(report)) {
    throw new TypeError('The effects engine wrote no report');
  }
  return { work, report };
}
