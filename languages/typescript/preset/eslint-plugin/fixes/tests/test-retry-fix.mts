import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import type { SourceCode } from '../../rules/typed/node-views.mts';
import { removingProperty } from '../support/objects.mts';
import { removingStatement, type FixPlan } from '../support/ranges.mts';

function isOptionsOfCall(object: TSESTree.ObjectExpression): boolean {
  return (
    object.parent.type === AST_NODE_TYPES.CallExpression && object.parent.arguments.includes(object)
  );
}

export function retryFix(sourceCode: SourceCode, retry: TSESTree.Node): FixPlan | undefined {
  const { parent } = retry;
  if (parent?.type === AST_NODE_TYPES.Property && parent.value === retry && !parent.computed) {
    const object = parent.parent;
    return object.type === AST_NODE_TYPES.ObjectExpression && isOptionsOfCall(object)
      ? removingProperty(sourceCode, parent)
      : undefined;
  }
  const isOnlyArgument =
    parent?.type === AST_NODE_TYPES.CallExpression && parent.arguments.length === 1;
  if (isOnlyArgument && parent.parent.type === AST_NODE_TYPES.ExpressionStatement) {
    return removingStatement(sourceCode, parent.parent);
  }
  return undefined;
}
