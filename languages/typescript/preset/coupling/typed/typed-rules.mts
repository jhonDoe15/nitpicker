import type { Finding } from '../../../adapters/static-checks/shared.mts';
import { evaluateCoupling as untypedEvaluateCoupling } from '../../../../../shared/rules/coupling.mts';
import { exceptionMatcher as untypedExceptionMatcher } from '../../../../../shared/rules/exceptions.mts';
import { sharedUsageFindings as untypedSharedUsageFindings } from '../../../../../shared/rules/features/shared-usage.mts';
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
