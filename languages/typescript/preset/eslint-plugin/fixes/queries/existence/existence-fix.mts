import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import type { Context } from '../../../rules/security/security-values.mts';
import type { ReportFix } from '../../support/ranges.mts';
import { prismaSelectFix } from './prisma-select.mts';
import { typeormExistsFix } from './typeorm-exists.mts';

export type ExistenceSuggestion = {
  readonly messageId: 'selectOneField' | 'useExists';
  readonly data: Readonly<Record<string, string>>;
  readonly plan: ReportFix;
};

export function existenceFix(
  context: Context,
  existence: { readonly awaited: TSESTree.AwaitExpression; readonly site: TSESTree.Node },
  call: TSESTree.Node,
): ExistenceSuggestion | undefined {
  if (call.type !== AST_NODE_TYPES.CallExpression) {
    return undefined;
  }
  const selected = prismaSelectFix(context, call, existence.awaited);
  if (selected !== undefined) {
    return { messageId: 'selectOneField', data: { field: selected.field }, plan: selected.plan };
  }
  const plan = typeormExistsFix(context, { call, ...existence });
  return plan === undefined ? undefined : { messageId: 'useExists', data: {}, plan };
}
