import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { ancestorsOf, nameOf } from '../typed/node-views.mts';
export { plainText } from '../truthiness/presence-checks.mts';

const FILTERS = new Set(['filter', 'find', 'findLast', 'some', 'every']);
const TEST_PARENTS = new Set<string>([
  AST_NODE_TYPES.IfStatement,
  AST_NODE_TYPES.ConditionalExpression,
  AST_NODE_TYPES.WhileStatement,
  AST_NODE_TYPES.DoWhileStatement,
]);

function isTransparent(parent: TSESTree.Node): boolean {
  switch (parent.type) {
    case AST_NODE_TYPES.UnaryExpression:
      return parent.operator === '!';
    case AST_NODE_TYPES.LogicalExpression:
    case AST_NODE_TYPES.TSNonNullExpression:
      return true;
    default:
      return false;
  }
}

function isBooleanArgument(parent: TSESTree.Node, child: TSESTree.Node): boolean {
  return (
    parent.type === AST_NODE_TYPES.CallExpression &&
    nameOf(parent.callee) === 'Boolean' &&
    parent.arguments[0] === child
  );
}

function isPredicateBody(parent: TSESTree.Node, child: TSESTree.Node): boolean {
  const call = parent.parent;
  return (
    parent.type === AST_NODE_TYPES.ArrowFunctionExpression &&
    parent.body === child &&
    call?.type === AST_NODE_TYPES.CallExpression &&
    call.arguments[0] === parent &&
    call.callee.type === AST_NODE_TYPES.MemberExpression &&
    FILTERS.has(nameOf(call.callee.property) ?? '')
  );
}

export function conditionRoot(node: TSESTree.Node): TSESTree.Node | undefined {
  let child = node;
  while (child.parent) {
    const { parent } = child;
    if (TEST_PARENTS.has(parent.type)) {
      return 'test' in parent && parent.test === child ? child : undefined;
    }
    if (isBooleanArgument(parent, child) || isPredicateBody(parent, child)) {
      return child;
    }
    if (!isTransparent(parent)) {
      return undefined;
    }
    child = parent;
  }
  return undefined;
}

const VALUE_PARENTS = new Set<string>([
  AST_NODE_TYPES.VariableDeclarator,
  AST_NODE_TYPES.ReturnStatement,
  AST_NODE_TYPES.ArrowFunctionExpression,
]);

export function presenceRoot(node: TSESTree.Node): TSESTree.Node | undefined {
  const condition = conditionRoot(node);
  if (condition !== undefined) {
    return condition;
  }
  let child = node;
  while (child.parent) {
    const { parent } = child;
    if (VALUE_PARENTS.has(parent.type)) {
      return child;
    }
    if (!isTransparent(parent)) {
      return undefined;
    }
    child = parent;
  }
  return undefined;
}

export function siblingsAfter(node: TSESTree.Node): TSESTree.Node[] {
  const holder = node.parent;
  let list: readonly TSESTree.Node[] = [];
  if (holder?.type === AST_NODE_TYPES.BlockStatement || holder?.type === AST_NODE_TYPES.Program) {
    list = holder.body;
  } else if (holder?.type === AST_NODE_TYPES.SwitchCase) {
    list = holder.consequent;
  }
  return list.slice(list.indexOf(node) + 1);
}

export function enclosingStatement(node: TSESTree.Node): TSESTree.Node {
  const holders = new Set<string>([
    AST_NODE_TYPES.BlockStatement,
    AST_NODE_TYPES.Program,
    AST_NODE_TYPES.SwitchCase,
  ]);
  return [node, ...ancestorsOf(node)].find((item) => holders.has(item.parent?.type ?? '')) ?? node;
}
