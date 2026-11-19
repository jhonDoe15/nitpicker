import type { Context } from '../../security/security-values.mts';
import { estreeCallView } from '../../support/io/call-views.mts';
import { executionOf, innerCalls, outerCalls, type Call } from './chain-execution.mts';

const FRAGMENT_BUILDERS = new Set(['raw', 'createQueryBuilder', 'createQueryRunner']);

export function isUnexecutedBuilder(call: Call, context: Context): boolean {
  const { method } = estreeCallView(call, context);
  const chained = outerCalls(call).length + innerCalls(call).length > 0;
  if (method === undefined || !(chained || FRAGMENT_BUILDERS.has(method))) {
    return false;
  }
  const execution = executionOf(call, context);
  return execution === 'unexecuted' || (execution === 'unknown' && FRAGMENT_BUILDERS.has(method));
}
