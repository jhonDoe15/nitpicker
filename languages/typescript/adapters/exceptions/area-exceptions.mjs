import { DEAD_CODE_RULES } from '../../../../shared/policy.mjs';
import { applyFindingExceptions } from '../../../../shared/exceptions/finding-exceptions.mjs';
import { ROUTED_RULES, withExceptionRoutes } from '../../../../shared/exceptions/routes.mjs';
import { readHeadPolicy } from '../../preset/head-policy.mjs';

export function applyAreaExceptions(findings, kind) {
  const routed = kind === 'dead-code' ? [...ROUTED_RULES, ...DEAD_CODE_RULES] : ROUTED_RULES;
  return applyFindingExceptions(withExceptionRoutes(findings, routed), readHeadPolicy().exceptions);
}
