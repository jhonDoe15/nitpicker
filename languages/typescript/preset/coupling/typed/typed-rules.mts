import type { Finding } from '../../../adapters/static-checks/shared.mts';
import { evaluateCoupling as untypedEvaluateCoupling } from '../../../../../shared/rules/coupling.mjs';
import { exceptionMatcher as untypedExceptionMatcher } from '../../../../../shared/rules/exceptions.mjs';
import { sharedUsageFindings as untypedSharedUsageFindings } from '../../../../../shared/rules/features/shared-usage.mjs';
import { cruise as untypedCruise } from '../../dependency-graph/cruise.mjs';
import { analyzeCoupling as untypedAnalyzeCoupling } from '../analyze.mjs';
import { existingRoots as untypedExistingRoots, type resolveLayout } from '../../layout.mjs';
import { readLayout as untypedReadLayout } from '../../head-policy.mjs';
type IsExcepted = (rule: string, ...candidates: string[]) => boolean;

export const evaluateCouplingMetrics: (report: unknown, analyzerName: string) => Finding[] =
  untypedEvaluateCoupling;

export const exceptionMatcher: (exceptions: readonly unknown[]) => IsExcepted =
  untypedExceptionMatcher;

export const sharedUsageFindings: (
  entries: readonly unknown[],
  options: { readonly analyzerName: string; readonly isExcepted: IsExcepted },
) => Finding[] = untypedSharedUsageFindings;

type ReportLayout = Omit<ReturnType<typeof resolveLayout>, 'sourceRoot' | 'sourceRoots'> & {
  readonly sourceRoot: string;
  readonly sourceRoots: string[];
};

type HubEntry = {
  readonly fanIn: number;
  readonly fanOut: number;
  readonly instability: number | undefined;
  readonly source: string;
};

type CouplingReport = {
  readonly summary: object;
  readonly stabilityDirection: readonly unknown[];
  readonly hubs: readonly HubEntry[];
};

export const cruise: (paths: readonly string[]) => unknown = untypedCruise;

export const existingRoots: (projectRoot: string, roots: readonly string[]) => string[] =
  untypedExistingRoots;

export const readLayout: () => ReportLayout = untypedReadLayout;

export const analyzeCoupling: (
  graph: unknown,
  sourceRoot: string,
  options: { readonly layout: ReportLayout },
) => CouplingReport = untypedAnalyzeCoupling;
