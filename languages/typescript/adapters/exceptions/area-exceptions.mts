import type { Finding } from '../static-checks/shared.mts';
import { applyFindingExceptions as untypedApplyFindingExceptions } from '../../../../shared/exceptions/finding-exceptions.mjs';
import { withExceptionRoutes as untypedWithExceptionRoutes } from '../../../../shared/exceptions/routes.mjs';
import { readHeadPolicy } from '../typed/head-policy.mts';

const applyFindingExceptions: (findings: Finding[], exceptions: unknown[]) => Finding[] =
  untypedApplyFindingExceptions;
const withExceptionRoutes: (findings: readonly Finding[]) => Finding[] = untypedWithExceptionRoutes;

export function applyAreaExceptions(findings: readonly Finding[]): Finding[] {
  return applyFindingExceptions(withExceptionRoutes(findings), readHeadPolicy().exceptions);
}
