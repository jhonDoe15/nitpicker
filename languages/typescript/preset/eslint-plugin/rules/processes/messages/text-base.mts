import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { chainOf, nameOf } from '../../typed/node-views.mts';
import { outermostOf, unwrapOf } from '../../typed/syntax-views.mts';

const TEXT_STEPS = new Set(['toString', 'trim', 'trimEnd', 'trimStart']);
const VALUE_WRAPPERS = [
  AST_NODE_TYPES.AwaitExpression,
  AST_NODE_TYPES.TSAsExpression,
  AST_NODE_TYPES.TSNonNullExpression,
  AST_NODE_TYPES.TSSatisfiesExpression,
  AST_NODE_TYPES.ChainExpression,
];
const PLAIN_WRAPPERS = [
  AST_NODE_TYPES.TSAsExpression,
  AST_NODE_TYPES.TSNonNullExpression,
  AST_NODE_TYPES.ChainExpression,
];

export function outerValue(node: TSESTree.Node): TSESTree.Node {
  return outermostOf(node, VALUE_WRAPPERS);
}

export function plainValue(node: TSESTree.Node): TSESTree.Node {
  return unwrapOf(node, PLAIN_WRAPPERS);
}

function innerText(node: TSESTree.Node): TSESTree.Node | undefined {
  const plain = plainValue(node);
  if (plain.type !== AST_NODE_TYPES.CallExpression) {
    return plain === node ? undefined : plain;
  }
  const { callee } = plain;
  if (nameOf(callee) === 'String') {
    return plain.arguments[0];
  }
  return callee.type === AST_NODE_TYPES.MemberExpression &&
    TEXT_STEPS.has(nameOf(callee.property) ?? '')
    ? callee.object
    : undefined;
}

export function textBase(node: TSESTree.Node): TSESTree.Node {
  return plainValue(chainOf(node, innerText).at(-1) ?? node);
}

export function outerText(node: TSESTree.Node): TSESTree.Node | undefined {
  const { parent } = node;
  if (
    parent?.type === AST_NODE_TYPES.MemberExpression &&
    parent.object === node &&
    TEXT_STEPS.has(nameOf(parent.property) ?? '') &&
    parent.parent.type === AST_NODE_TYPES.CallExpression &&
    parent.parent.callee === parent
  ) {
    return outerValue(parent.parent);
  }
  return undefined;
}
