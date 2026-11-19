import { AST_NODE_TYPES, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { isFunctionNode } from '../analysis/constant-resolution.mts';
import { nodeChildren, scopeChain } from '../typed/node-views.mts';
import { appendAll } from '../../../../../../shared/lists/lists.mts';

const EQUALITY = new Set(['==', '===']);

export function targetKey(node: TSESTree.Node): string | undefined {
  if (node.type === AST_NODE_TYPES.Identifier) {
    return node.name === 'undefined' ? undefined : node.name;
  }
  if (
    node.type === AST_NODE_TYPES.MemberExpression &&
    node.object.type === AST_NODE_TYPES.ThisExpression &&
    !node.computed
  ) {
    const { property } = node;
    if (property.type === AST_NODE_TYPES.Identifier) {
      return `this.${property.name}`;
    }
    return `this.#${property.name}`;
  }
  return undefined;
}

function isNullish(node: TSESTree.Node): boolean {
  return (
    (node.type === AST_NODE_TYPES.Literal && node.raw === 'null') ||
    (node.type === AST_NODE_TYPES.Identifier && node.name === 'undefined') ||
    (node.type === AST_NODE_TYPES.UnaryExpression && node.operator === 'void')
  );
}

function comparedKey(test: TSESTree.BinaryExpression): string | undefined {
  if (!EQUALITY.has(test.operator)) {
    return undefined;
  }
  if (isNullish(test.right)) {
    return targetKey(test.left);
  }
  return isNullish(test.left) ? targetKey(test.right) : undefined;
}

function orOperands(test: TSESTree.Node): TSESTree.Node[] {
  const operands = [test];
  const found: TSESTree.Node[] = [];
  for (const operand of operands) {
    if (operand.type === AST_NODE_TYPES.LogicalExpression && operand.operator === '||') {
      operands.push(operand.left, operand.right);
    } else {
      found.push(operand);
    }
  }
  return found;
}

export function nullTarget(test: TSESTree.Node): string | undefined {
  const keys = orOperands(test).map((operand) =>
    operand.type === AST_NODE_TYPES.BinaryExpression ? comparedKey(operand) : undefined,
  );
  const [first] = keys;
  return keys.every((key) => key === first) ? first : undefined;
}

function skippedChild(node: TSESTree.Node): TSESTree.Node | undefined {
  if (
    node.type === AST_NODE_TYPES.Property ||
    node.type === AST_NODE_TYPES.MethodDefinition ||
    node.type === AST_NODE_TYPES.PropertyDefinition
  ) {
    return node.computed ? undefined : node.key;
  }
  if (node.type === AST_NODE_TYPES.MemberExpression) {
    return node.computed ? undefined : node.property;
  }
  return undefined;
}

function ownChildren(node: TSESTree.Node): TSESTree.Node[] {
  const skipped = skippedChild(node);
  return nodeChildren(node)
    .filter((child) => child !== skipped)
    .sort((left, right) => left.range[0] - right.range[0]);
}

export function collectNodes(
  root: TSESTree.Node,
  entersFunction: (node: TSESTree.Node) => boolean,
): TSESTree.Node[] {
  const visited = [root];
  for (const node of visited) {
    if (!isFunctionNode(node) || entersFunction(node)) {
      appendAll(visited, ownChildren(node));
    }
  }
  return visited;
}

export function nodesWithin(root: TSESTree.Node): TSESTree.Node[] {
  return collectNodes(root, (node) => node === root);
}

export function isSharedKey(key: string, scope: TSESLint.Scope.Scope): boolean {
  if (key.startsWith('this.')) {
    return true;
  }
  const declaring = scopeChain(scope).find((candidate) => candidate.set.has(key));
  return (
    declaring === undefined ||
    declaring.type === TSESLint.Scope.ScopeType.module ||
    declaring.type === TSESLint.Scope.ScopeType.global
  );
}
