import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { findVariable, isFunctionNode } from '../../../rules/analysis/constant-resolution.mts';
import type { Context } from '../../../rules/security/security-values.mts';
import { ancestorsOf } from '../../../rules/typed/node-views.mts';

const DEADLINE_CALLEE = /timeout|deadline|race|abort|\.any$/iu;

function isDeadlineCall(context: Context, node: TSESTree.Node): boolean {
  return (
    node.type === AST_NODE_TYPES.CallExpression &&
    DEADLINE_CALLEE.test(context.sourceCode.getText(node.callee))
  );
}

function underDeadlineCall(context: Context, node: TSESTree.Node): boolean {
  for (const ancestor of ancestorsOf(node)) {
    if (isFunctionNode(ancestor)) {
      return false;
    }
    if (isDeadlineCall(context, ancestor)) {
      return true;
    }
  }
  return false;
}

function boundName(call: TSESTree.CallExpression): TSESTree.Identifier | undefined {
  const awaited = call.parent.type === AST_NODE_TYPES.AwaitExpression ? call.parent : call;
  const declarator = awaited.parent;
  return declarator.type === AST_NODE_TYPES.VariableDeclarator &&
    declarator.id.type === AST_NODE_TYPES.Identifier
    ? declarator.id
    : undefined;
}

function isUsedUnderDeadline(context: Context, name: TSESTree.Identifier): boolean {
  const variable = findVariable(context, name, name.name);
  return (variable?.references ?? []).some(
    (reference) => !reference.init && underDeadlineCall(context, reference.identifier),
  );
}

export function isUnderDeadline(context: Context, call: TSESTree.CallExpression): boolean {
  const name = boundName(call);
  return (
    underDeadlineCall(context, call) || (name !== undefined && isUsedUnderDeadline(context, name))
  );
}
