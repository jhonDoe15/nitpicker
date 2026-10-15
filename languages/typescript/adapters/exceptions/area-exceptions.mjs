import { applyFindingExceptions } from '../../../../shared/exceptions/finding-exceptions.mjs';
import { withExceptionRoutes } from '../../../../shared/exceptions/routes.mjs';
import { readHeadPolicy } from '../../preset/head-policy.mjs';

export function applyAreaExceptions(findings) {
  return applyFindingExceptions(withExceptionRoutes(findings), readHeadPolicy().exceptions);
}
