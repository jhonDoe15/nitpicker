import type { TSESTree } from '@typescript-eslint/utils';
import type { Context } from '../../../rules/security/security-values.mts';
import type { FixPlans } from '../../edits/plans.mts';
import { isInert } from '../loops/loop-effects.mts';
import { loopCall } from '../loops/loop-call.mts';
import { ormCall } from '../orm/orm-call.mts';
import { writeSuggestion } from './writes/write-suggestion.mts';
import { mgetSuggestion } from './redis/mget-suggestion.mts';
import { lookupSuggestion } from './lookups/lookup-suggestion.mts';

export type BatchSuggestion = {
  readonly messageId: 'batchLookup' | 'batchGroups' | 'batchMget' | 'batchWrite' | 'batchInsert';
  readonly plan: FixPlans;
};

export function batchSuggestion(
  context: Context,
  call: TSESTree.CallExpression,
): BatchSuggestion | undefined {
  const orm = ormCall(context, call);
  const loop = orm === undefined ? undefined : loopCall(context, call);
  if (orm === undefined || loop === undefined || !isInert(context, loop, call)) {
    return undefined;
  }
  if (orm.orm === 'typeorm' || orm.orm === 'prisma') {
    return (
      lookupSuggestion(context, call, { orm, loop }) ??
      writeSuggestion(context, call, { orm, loop })
    );
  }
  if (orm.orm === 'ioredis' || orm.orm === 'node-redis') {
    return mgetSuggestion(context, call, { orm, loop });
  }
  return undefined;
}
