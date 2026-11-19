import type { TSESTree } from '@typescript-eslint/utils';
import type { Context } from '../../rules/security/security-values.mts';
import { hasArrayType } from '../../rules/support/checked-types.mts';
import { hasCommentIn, replacing, type FixPlan } from '../support/ranges.mts';
import { isPlainReceiver, readsAccessor } from './support/receivers.mts';

export function lengthCheckFix(
  context: Context,
  logical: TSESTree.LogicalExpression,
  receiver: TSESTree.Node,
): FixPlan | undefined {
  const { sourceCode } = context;
  const proven =
    isPlainReceiver(receiver) &&
    !hasCommentIn(sourceCode, logical.range) &&
    hasArrayType(context, receiver) === 'yes' &&
    !readsAccessor(context, receiver);
  return proven ? replacing(logical.range, sourceCode.getText(logical.right)) : undefined;
}
