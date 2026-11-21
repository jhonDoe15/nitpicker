import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { ancestorsOf } from '../analysis/ancestry.mts';
import { isFunctionNode } from '../analysis/constant-resolution.mts';
import { chainOf } from '../typed/node-views.mts';

const WRAPPERS = new Set<string>([
  AST_NODE_TYPES.ChainExpression,
  AST_NODE_TYPES.TSNonNullExpression,
  AST_NODE_TYPES.TSAsExpression,
]);
const EQUALITY = new Set(['===', '!==', '==', '!=']);
const LOOPS = new Set<string>([
  AST_NODE_TYPES.ForStatement,
  AST_NODE_TYPES.ForInStatement,
  AST_NODE_TYPES.ForOfStatement,
  AST_NODE_TYPES.WhileStatement,
  AST_NODE_TYPES.DoWhileStatement,
  AST_NODE_TYPES.SwitchStatement,
]);

export function isWrapper(node: TSESTree.Node): boolean {
  return WRAPPERS.has(node.type);
}

export function outermost(node: TSESTree.Node): TSESTree.Node {
  const chain = chainOf<TSESTree.Node>(node, (current) =>
    current.parent !== undefined && WRAPPERS.has(current.parent.type) ? current.parent : undefined,
  );
  return chain.at(-1) ?? node;
}

export function declaredName(lookup: TSESTree.Node): TSESTree.VariableDeclarator | undefined {
  const value = outermost(lookup);
  const { parent } = value;
  return parent?.type === AST_NODE_TYPES.VariableDeclarator &&
    parent.init === value &&
    parent.id.type === AST_NODE_TYPES.Identifier &&
    parent.parent.declarations.length === 1
    ? parent
    : undefined;
}

export function isInnerLoopExit(node: TSESTree.Node, walkBody: TSESTree.Node): boolean {
  const ancestors = ancestorsOf(node);
  const inside = ancestors.slice(0, Math.max(0, ancestors.indexOf(walkBody)));
  return inside.some((ancestor) => LOOPS.has(ancestor.type));
}

export function outermostFunction(node: TSESTree.Node): TSESTree.Node | undefined {
  return [node, ...ancestorsOf(node)].findLast((ancestor) => isFunctionNode(ancestor));
}

function isNullish(side: TSESTree.Node): boolean {
  return (
    (side.type === AST_NODE_TYPES.Identifier && side.name === 'undefined') ||
    (side.type === AST_NODE_TYPES.Literal && side.value === null)
  );
}

function isPresenceUse(parent: TSESTree.Node, value: TSESTree.Node): boolean {
  if (parent.type === AST_NODE_TYPES.UnaryExpression) {
    return parent.operator === '!';
  }
  if (
    parent.type === AST_NODE_TYPES.IfStatement ||
    parent.type === AST_NODE_TYPES.ConditionalExpression
  ) {
    return parent.test === value;
  }
  if (parent.type === AST_NODE_TYPES.LogicalExpression) {
    return parent.operator === '&&' && parent.left === value;
  }
  if (parent.type === AST_NODE_TYPES.BinaryExpression) {
    return EQUALITY.has(parent.operator) && [parent.left, parent.right].some(isNullish);
  }
  return (
    parent.type === AST_NODE_TYPES.CallExpression &&
    parent.callee.type === AST_NODE_TYPES.Identifier &&
    parent.callee.name === 'Boolean' &&
    parent.arguments.length === 1
  );
}

export function isPresenceOnly(node: TSESTree.Node): boolean {
  const value = outermost(node);
  return value.parent !== undefined && isPresenceUse(value.parent, value);
}
