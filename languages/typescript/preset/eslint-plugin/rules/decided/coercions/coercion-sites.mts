import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { syntaxChildren, isFunction } from '../syntax.mts';
import { appendAll } from '../../../../../../../shared/lists/lists.mts';

export type Guard = {
  readonly test: TSESTree.Node;
  readonly holds: boolean;
  readonly branch: TSESTree.Node;
};
export type CoercionSite = {
  readonly node: TSESTree.Node;
  readonly operand: TSESTree.Node;
  readonly guards: readonly Guard[];
};
type GuardedChild = { readonly child: TSESTree.Node; readonly guard: Guard | undefined };

const REFERENCES = new Set<string>([
  AST_NODE_TYPES.Identifier,
  AST_NODE_TYPES.MemberExpression,
  AST_NODE_TYPES.ChainExpression,
]);

function isNegation(node: TSESTree.Node): node is TSESTree.UnaryExpression {
  return node.type === AST_NODE_TYPES.UnaryExpression && node.operator === '!';
}

function coercedOperand(node: TSESTree.Node): TSESTree.Node | undefined {
  if (
    node.type === AST_NODE_TYPES.CallExpression &&
    node.callee.type === AST_NODE_TYPES.Identifier &&
    node.callee.name === 'Boolean' &&
    node.arguments.length === 1
  ) {
    return node.arguments[0];
  }
  return isNegation(node) && isNegation(node.argument) ? node.argument.argument : undefined;
}

function guardedChildren(node: TSESTree.Node): GuardedChild[] {
  if (node.type === AST_NODE_TYPES.ConditionalExpression) {
    return [
      { child: node.test, guard: undefined },
      { child: node.consequent, guard: { test: node.test, holds: true, branch: node.consequent } },
      { child: node.alternate, guard: { test: node.test, holds: false, branch: node.alternate } },
    ];
  }
  if (node.type === AST_NODE_TYPES.LogicalExpression && node.operator !== '??') {
    return [
      { child: node.left, guard: undefined },
      {
        child: node.right,
        guard: { test: node.left, holds: node.operator === '&&', branch: node.right },
      },
    ];
  }
  return syntaxChildren(node).map((child) => ({ child, guard: undefined }));
}

/**
 * The `Boolean(x)` and `!!x` coercions of a reference inside `root`, outside nested functions, each
 * with the tests (`{ test, holds }`) of the conditional branches and `&&`/`||` operands around it.
 */
export function coercionSites(root: TSESTree.Node): CoercionSite[] {
  const sites: CoercionSite[] = [];
  const pending: { node: TSESTree.Node; guards: readonly Guard[] }[] = [{ node: root, guards: [] }];
  for (const { node, guards } of pending) {
    const operand = coercedOperand(node);
    if (operand !== undefined && REFERENCES.has(operand.type)) {
      sites.push({ node, operand, guards });
    }
    if (!isFunction(node)) {
      appendAll(
        pending,
        guardedChildren(node).map(({ child, guard }) => ({
          node: child,
          guards: guard === undefined ? guards : [...guards, guard],
        })),
      );
    }
  }
  return sites;
}
