import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import type { SourceCode } from '../../rules/typed/node-views.mts';
import { removingProperty } from '../support/objects.mts';
import { removingStatement, type FixPlan } from '../support/ranges.mts';

export function tlsOptionFix(sourceCode: SourceCode, node: TSESTree.Node): FixPlan | undefined {
  if (node.type === AST_NODE_TYPES.Property) {
    return node.parent.type === AST_NODE_TYPES.ObjectExpression && !node.computed
      ? removingProperty(sourceCode, node)
      : undefined;
  }
  const isStatement =
    node.type === AST_NODE_TYPES.AssignmentExpression &&
    node.parent.type === AST_NODE_TYPES.ExpressionStatement;
  return isStatement ? removingStatement(sourceCode, node.parent) : undefined;
}
