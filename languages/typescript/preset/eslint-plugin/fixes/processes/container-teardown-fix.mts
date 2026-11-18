import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import type { SourceCode } from '../../rules/typed/node-views.mts';
import { hasCommentIn, replacing, type FixPlan } from '../support/ranges.mts';
import { isDeclared } from '../support/scope.mts';

export function teardownFix(
  sourceCode: SourceCode,
  call: TSESTree.CallExpression,
  member: TSESTree.MemberExpression,
): FixPlan | undefined {
  const isOptional =
    call.optional || member.optional || call.parent.type === AST_NODE_TYPES.ChainExpression;
  if (
    call.arguments.length > 0 ||
    isOptional ||
    call.callee.type === AST_NODE_TYPES.ChainExpression
  ) {
    return undefined;
  }
  if (!isDeclared(sourceCode, call, 'teardownContainer') || hasCommentIn(sourceCode, call.range)) {
    return undefined;
  }
  return replacing(call.range, `teardownContainer(${sourceCode.getText(member.object)})`);
}
