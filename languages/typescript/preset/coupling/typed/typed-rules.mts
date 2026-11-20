import type { Finding } from '../../../adapters/static-checks/shared.mts';
import { evaluateCoupling as untypedEvaluateCoupling } from '../../../../../shared/rules/coupling.mjs';
import { exceptionMatcher as untypedExceptionMatcher } from '../../../../../shared/rules/exceptions.mjs';
import { sharedUsageFindings as untypedSharedUsageFindings } from '../../../../../shared/rules/features/shared-usage.mjs';
import type { resolveLayout } from '../../layout.mts';
import { readLayout as untypedReadLayout } from '../../head-policy.mts';
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

export const readLayout: () => ReportLayout = untypedReadLayout;

export { analyzeCoupling } from '../analyze.mts';
