import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import type { SourceCode } from '../../typed/node-views.mts';

const BOUNDARY = /Statement$|Declaration$|Declarator$|^Program$|Function/;

export function isPattern(node: TSESTree.Node): boolean {
  return node.type === AST_NODE_TYPES.ObjectPattern || node.type === AST_NODE_TYPES.ArrayPattern;
}

export function isDereference(node: TSESTree.Node): boolean {
  const { parent } = node;
  if (parent === undefined) {
    return false;
  }
  if (parent.type === AST_NODE_TYPES.MemberExpression) {
    return parent.object === node && !parent.optional;
  }
  if (parent.type === AST_NODE_TYPES.SpreadElement) {
    return parent.parent.type !== AST_NODE_TYPES.ObjectExpression;
  }
  if (parent.type === AST_NODE_TYPES.ForOfStatement) {
    return parent.right === node;
  }
  if (parent.type === AST_NODE_TYPES.VariableDeclarator) {
    return parent.init === node && isPattern(parent.id);
  }
  return (
    parent.type === AST_NODE_TYPES.AssignmentExpression &&
    parent.right === node &&
    isPattern(parent.left)
  );
}

function ownChain(node: TSESTree.Node): TSESTree.Node[] {
  const chain = [node];
  for (const current of chain) {
    const { parent } = current;
    if (parent !== undefined && !BOUNDARY.test(parent.type)) {
      chain.push(parent);
    }
  }
  return chain;
}

function takesAsArgument(
  parent: TSESTree.Node,
  child: TSESTree.Node | undefined,
  standIns: { readonly callees: ReadonlySet<string>; readonly sourceCode: SourceCode },
): boolean {
  const isCall =
    parent.type === AST_NODE_TYPES.CallExpression || parent.type === AST_NODE_TYPES.NewExpression;
  return (
    isCall &&
    parent.arguments.some((argument) => argument === child) &&
    standIns.callees.has(standIns.sourceCode.getText(parent.callee))
  );
}

export function isPassedOn(
  node: TSESTree.Node,
  standIns: { readonly callees: ReadonlySet<string>; readonly sourceCode: SourceCode },
): boolean {
  const chain = ownChain(node);
  return chain.some(
    (parent, index) => index > 0 && takesAsArgument(parent, chain[index - 1], standIns),
  );
}
