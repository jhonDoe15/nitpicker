import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import {
  ASSERTION_FORMS,
  isFunction,
  unwrapOf,
  type FunctionNode,
} from '../typed/syntax-views.mts';
import { depthFirst, nameOf, nodeChildren } from '../typed/node-views.mts';

export type Comparator = {
  readonly fn: FunctionNode;
  readonly left: string;
  readonly right: string;
};

type Branch = {
  readonly test: TSESTree.Expression;
  readonly outcome: TSESTree.Node | undefined;
  readonly otherwise: TSESTree.Node | undefined;
  readonly node: TSESTree.Node;
};

export function comparatorOf(fn: FunctionNode): Comparator | undefined {
  const [left, right, ...rest] = fn.params;
  return left?.type === AST_NODE_TYPES.Identifier &&
    right?.type === AST_NODE_TYPES.Identifier &&
    rest.length === 0
    ? { fn, left: left.name, right: right.name }
    : undefined;
}

function ownNodes(fn: FunctionNode): Iterable<TSESTree.Node> {
  return depthFirst<TSESTree.Node>(fn.body, (node) => (isFunction(node) ? [] : nodeChildren(node)));
}

export function returnedValues(fn: FunctionNode): TSESTree.Expression[] {
  if (fn.body.type !== AST_NODE_TYPES.BlockStatement) {
    return [fn.body];
  }
  const values: TSESTree.Expression[] = [];
  for (const node of ownNodes(fn)) {
    if (node.type === AST_NODE_TYPES.ReturnStatement && node.argument) {
      values.push(node.argument);
    }
  }
  const last = fn.body.body.at(-1);
  return last?.type === AST_NODE_TYPES.ReturnStatement ? values : [];
}

export function outcomesOf(node: TSESTree.Node): TSESTree.Node[] {
  const value = unwrapOf(node, ASSERTION_FORMS);
  return value.type === AST_NODE_TYPES.ConditionalExpression
    ? [...outcomesOf(value.consequent), ...outcomesOf(value.alternate)]
    : [value];
}

function numberOf(node: TSESTree.Node): number | undefined {
  if (node.type === AST_NODE_TYPES.Literal && typeof node.value === 'number') {
    return node.value;
  }
  if (node.type === AST_NODE_TYPES.UnaryExpression && node.operator === '-') {
    const inner = numberOf(node.argument);
    return inner === undefined ? undefined : -inner;
  }
  return undefined;
}

export function isNonZeroNumber(node: TSESTree.Node): boolean {
  const value = numberOf(node);
  return value !== undefined && value !== 0;
}

function soleReturn(node: TSESTree.Node): TSESTree.Node | undefined {
  if (node.type === AST_NODE_TYPES.ReturnStatement) {
    return node.argument ?? undefined;
  }
  return node.type === AST_NODE_TYPES.BlockStatement && node.body.length === 1 && node.body[0]
    ? soleReturn(node.body[0])
    : undefined;
}

export function branchesOf(fn: FunctionNode): Branch[] {
  const branches: Branch[] = [];
  for (const node of ownNodes(fn)) {
    if (node.type === AST_NODE_TYPES.ConditionalExpression) {
      branches.push({
        test: node.test,
        outcome: node.consequent,
        otherwise: node.alternate,
        node,
      });
    } else if (node.type === AST_NODE_TYPES.IfStatement) {
      branches.push({
        test: node.test,
        outcome: soleReturn(node.consequent),
        otherwise: node.alternate === null ? undefined : soleReturn(node.alternate),
        node,
      });
    }
  }
  return branches;
}

function isCallOf(node: TSESTree.Node, owner: string, method: string): boolean {
  return (
    node.type === AST_NODE_TYPES.CallExpression &&
    node.callee.type === AST_NODE_TYPES.MemberExpression &&
    nameOf(node.callee.object) === owner &&
    nameOf(node.callee.property) === method
  );
}

function isUniqueSource(node: TSESTree.Node): boolean {
  const value = unwrapOf(node, ASSERTION_FORMS);
  switch (value.type) {
    case AST_NODE_TYPES.NewExpression:
      return nameOf(value.callee) === 'Set';
    case AST_NODE_TYPES.ArrayExpression: {
      const [only, ...rest] = value.elements;
      return (
        rest.length === 0 &&
        only?.type === AST_NODE_TYPES.SpreadElement &&
        isUniqueSource(only.argument)
      );
    }
    case AST_NODE_TYPES.CallExpression:
      return (
        isCallOf(value, 'Object', 'keys') ||
        (isCallOf(value, 'Array', 'from') && value.arguments[0] !== undefined
          ? isUniqueSource(value.arguments[0])
          : false) ||
        (value.callee.type === AST_NODE_TYPES.MemberExpression &&
          nameOf(value.callee.property) === 'keys' &&
          value.arguments.length === 0)
      );
    default:
      return false;
  }
}

export function sortsUniqueItems(receiver: TSESTree.Node, comparatorText: string): boolean {
  const value = unwrapOf(receiver, ASSERTION_FORMS);
  return (
    isUniqueSource(value) ||
    (isCallOf(value, 'Object', 'entries') &&
      comparatorText.includes('[0]') &&
      !comparatorText.includes('[1]'))
  );
}
