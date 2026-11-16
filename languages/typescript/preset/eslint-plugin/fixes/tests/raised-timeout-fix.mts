import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import type { SourceCode } from '../../rules/typed/node-views.mts';
import { removingLastArgument } from '../support/calls.mts';
import { removingProperty } from '../support/objects.mts';
import type { FixPlan } from '../support/ranges.mts';

export function raisedTimeoutFix(
  sourceCode: SourceCode,
  timeout: TSESTree.Node,
): FixPlan | undefined {
  const { parent } = timeout;
  if (parent?.type === AST_NODE_TYPES.Property && parent.value === timeout && !parent.computed) {
    const options = parent.parent;
    const isInline =
      options.type === AST_NODE_TYPES.ObjectExpression &&
      options.parent.type === AST_NODE_TYPES.CallExpression &&
      options.parent.arguments.includes(options);
    return isInline ? removingProperty(sourceCode, parent) : undefined;
  }
  const isArgument =
    parent?.type === AST_NODE_TYPES.CallExpression &&
    parent.arguments.findIndex((each) => each === timeout) > 0;
  return isArgument ? removingLastArgument(sourceCode, parent, timeout) : undefined;
}
