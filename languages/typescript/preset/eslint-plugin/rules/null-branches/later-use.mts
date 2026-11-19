import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { isFunctionNode } from '../analysis/constant-resolution.mts';
import type { SourceCode } from '../typed/node-views.mts';
import { collectNodes, nodesWithin, targetKey } from './null-targets.mts';
import { isDereference, isPassedOn, isPattern } from './uses/use-kinds.mts';

export type UseScan = {
  readonly key: string;
  readonly callees: ReadonlySet<string>;
  readonly sourceCode: SourceCode;
};

const ASSERTIONS = new Set(['assert', 'assert.ok', 'invariant', 'expect', 'ok']);
const CHECKING_PARENTS = new Set<string>([
  AST_NODE_TYPES.UnaryExpression,
  AST_NODE_TYPES.BinaryExpression,
  AST_NODE_TYPES.LogicalExpression,
]);
function isCheck(node: TSESTree.Node): boolean {
  const { parent } = node;
  if (parent === undefined) {
    return false;
  }
  if (CHECKING_PARENTS.has(parent.type)) {
    return true;
  }
  if (parent.type === AST_NODE_TYPES.MemberExpression) {
    return parent.optional && parent.object === node;
  }
  return (
    ('test' in parent && parent.test === node) ||
    (parent.type === AST_NODE_TYPES.SwitchStatement && parent.discriminant === node) ||
    (parent.type === AST_NODE_TYPES.CallExpression &&
      parent.callee !== node &&
      parent.arguments.length === 1)
  );
}

function mentions(node: TSESTree.Node, key: string): boolean {
  return nodesWithin(node).some((inner) => targetKey(inner) === key);
}

function guardTest(node: TSESTree.Node): TSESTree.Node | undefined {
  if (node.type === AST_NODE_TYPES.SwitchStatement) {
    return node.discriminant;
  }
  if (node.type === AST_NODE_TYPES.LogicalExpression) {
    return node.left;
  }
  if (node.type === AST_NODE_TYPES.ForStatement) {
    return node.test ?? undefined;
  }
  const tested =
    node.type === AST_NODE_TYPES.IfStatement ||
    node.type === AST_NODE_TYPES.ConditionalExpression ||
    node.type === AST_NODE_TYPES.WhileStatement ||
    node.type === AST_NODE_TYPES.DoWhileStatement;
  return tested ? node.test : undefined;
}

function stopsHere(node: TSESTree.Node, scan: UseScan): boolean {
  const guarded = guardTest(node);
  if (guarded !== undefined) {
    return nodesWithin(guarded).some((inner) => targetKey(inner) === scan.key && isCheck(inner));
  }
  return (
    node.type === AST_NODE_TYPES.CallExpression &&
    ASSERTIONS.has(scan.sourceCode.getText(node.callee)) &&
    node.arguments.some((argument) => mentions(argument, scan.key))
  );
}

function isCalledFunction(node: TSESTree.Node): boolean {
  return (
    isFunctionNode(node) &&
    node.parent.type === AST_NODE_TYPES.CallExpression &&
    node.parent.callee === node
  );
}

function inOrder(root: TSESTree.Node): TSESTree.Node[] {
  return collectNodes(root, isCalledFunction).sort(
    (left, right) => left.range[0] - right.range[0] || right.range[1] - left.range[1],
  );
}

function rebinds(node: TSESTree.Node, key: string): boolean {
  if (node.type !== AST_NODE_TYPES.AssignmentExpression) {
    return false;
  }
  return isPattern(node.left) ? mentions(node.left, key) : targetKey(node.left) === key;
}

function isUse(node: TSESTree.Node, scan: UseScan): boolean {
  return targetKey(node) === scan.key && (isDereference(node) || isPassedOn(node, scan));
}

export function firstUse(
  statements: readonly TSESTree.Node[],
  scan: UseScan,
): TSESTree.Node | undefined {
  let settledAt = Infinity;
  for (const node of statements.flatMap(inOrder)) {
    if (node.range[0] >= settledAt || stopsHere(node, scan)) {
      return undefined;
    }
    if (isUse(node, scan)) {
      return node;
    }
    if (rebinds(node, scan.key)) {
      settledAt = node.range[1];
    }
  }
  return undefined;
}
