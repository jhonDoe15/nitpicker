import type { TSESTree } from '@typescript-eslint/utils';
import type { Context } from '../../../../rules/security/security-values.mts';
import type { FixPlans } from '../../../edits/plans.mts';
import { isInvariant } from '../../loops/invariants.mts';
import { isAlwaysReached } from '../../loops/loop-effects.mts';
import { resultDeclarator, type LoopCall } from '../../loops/loop-call.mts';
import { isReadOnlyResult, isStoredResult } from '../../loops/result-uses.mts';
import { hasUniqueKeys } from '../../loops/unique-keys.mts';
import type { OrmCall } from '../../orm/orm-call.mts';
import { lookupFix } from './lookup-fix.mts';
import type { Site } from './lookup-plan.mts';
import { prismaLookup } from './prisma-lookup.mts';
import { typeormLookup } from './typeorm-lookup.mts';

export type LookupSuggestion = {
  readonly messageId: 'batchLookup' | 'batchGroups';
  readonly plan: FixPlans;
};

export function lookupSuggestion(
  context: Context,
  call: TSESTree.CallExpression,
  { orm, loop }: { readonly orm: OrmCall; readonly loop: LoopCall },
): LookupSuggestion | undefined {
  const declarator = resultDeclarator(loop, call);
  if (declarator === undefined) {
    return undefined;
  }
  const repeated = { range: loop.range, body: loop.body, target: call };
  const site: Site = { context, call, loop, orm, repeated, declarator };
  if (!isInvariant(context.sourceCode, orm.receiver, repeated)) {
    return undefined;
  }
  const lookup = orm.orm === 'typeorm' ? typeormLookup(site) : prismaLookup(site);
  if (lookup === undefined || !isReadOnlyResult(context, declarator, lookup.kind)) {
    return undefined;
  }
  const shared = isStoredResult(context, declarator) && !hasUniqueKeys(context, loop.iterable);
  if (shared || !isAlwaysReached(context, loop)) {
    return undefined;
  }
  const plan = lookupFix(site, lookup);
  return plan === undefined
    ? undefined
    : { messageId: lookup.kind === 'row' ? 'batchLookup' : 'batchGroups', plan };
}
