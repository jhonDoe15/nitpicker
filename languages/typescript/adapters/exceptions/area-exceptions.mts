import type { Finding } from '../static-checks/shared.mts';
import { applyFindingExceptions } from '../../../../shared/exceptions/finding-exceptions.mts';
import { withExceptionRoutes } from '../../../../shared/exceptions/routes.mts';
import { readHeadPolicy } from '../typed/head-policy.mts';

export function applyAreaExceptions(findings: readonly Finding[]): Finding[] {
  return [...applyFindingExceptions(withExceptionRoutes(findings), readHeadPolicy().exceptions)];
}
