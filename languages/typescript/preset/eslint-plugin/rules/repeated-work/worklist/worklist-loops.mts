import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import {
  calledMember,
  callbackRole,
  memberName,
  unwrapped,
} from '../../collections/costly-forms/repeated-runs.mts';
import { ancestorsOf, contains, depthFirst, nodeChildren } from '../../typed/node-views.mts';
import { isFunction } from '../../typed/syntax-views.mts';

export type WorklistLoopNode = TSESTree.ForOfStatement | TSESTree.WhileStatement;

export type WorklistLoop = {
  readonly loop: WorklistLoopNode;
  readonly name: string;
  readonly appends: readonly TSESTree.CallExpression[];
};

const APPEND_METHODS = new Set(['push', 'unshift']);
const REMOVE_METHODS = new Set(['shift', 'pop']);
const INNER_LOOPS = new Set<string>([
  AST_NODE_TYPES.ForStatement,
  AST_NODE_TYPES.ForOfStatement,
  AST_NODE_TYPES.ForInStatement,
  AST_NODE_TYPES.WhileStatement,
  AST_NODE_TYPES.DoWhileStatement,
]);

function isNumericLiteral(node: TSESTree.Node, expected: number): boolean {
  const value = unwrapped(node);
  return value.type === AST_NODE_TYPES.Literal && value.value === expected;
}

function lengthPropertyObject(node: TSESTree.Node): string | undefined {
  const value = unwrapped(node);
  if (value.type !== AST_NODE_TYPES.MemberExpression || memberName(value) !== 'length') {
    return undefined;
  }
  const object = unwrapped(value.object);
  return object.type === AST_NODE_TYPES.Identifier ? object.name : undefined;
}

function binaryLengthTarget(expr: TSESTree.BinaryExpression): string | undefined {
  const leftName = lengthPropertyObject(expr.left);
  if (leftName !== undefined) {
    const validRight =
      (['>', '!==', '!='].includes(expr.operator) && isNumericLiteral(expr.right, 0)) ||
      (expr.operator === '>=' && isNumericLiteral(expr.right, 1));
    return validRight ? leftName : undefined;
  }
  const rightName = lengthPropertyObject(expr.right);
  if (rightName === undefined) {
    return undefined;
  }
  const validLeft =
    (['<', '!==', '!='].includes(expr.operator) && isNumericLiteral(expr.left, 0)) ||
    (expr.operator === '<=' && isNumericLiteral(expr.left, 1));
  return validLeft ? rightName : undefined;
}

function lengthTargetOf(node: TSESTree.Node): string | undefined {
  const value = unwrapped(node);
  const direct = lengthPropertyObject(value);
  if (direct !== undefined) {
    return direct;
  }
  if (value.type === AST_NODE_TYPES.BinaryExpression) {
    return binaryLengthTarget(value);
  }
  if (value.type === AST_NODE_TYPES.LogicalExpression && value.operator === '&&') {
    return lengthTargetOf(value.left) ?? lengthTargetOf(value.right);
  }
  return undefined;
}

function worklistNameOf(loop: WorklistLoopNode): string | undefined {
  if (loop.type === AST_NODE_TYPES.ForOfStatement) {
    const target = unwrapped(loop.right);
    return target.type === AST_NODE_TYPES.Identifier ? target.name : undefined;
  }
  return lengthTargetOf(loop.test);
}

export function loopBodyNodes(loop: WorklistLoopNode): TSESTree.Node[] {
  return [
    ...depthFirst<TSESTree.Node>(loop.body, (node) =>
      node !== loop.body && isFunction(node) && callbackRole(node) !== 'callback'
        ? []
        : nodeChildren(node),
    ),
  ];
}

function isMethodOn(
  node: TSESTree.Node,
  name: string,
  methods: ReadonlySet<string>,
): node is TSESTree.CallExpression {
  if (node.type !== AST_NODE_TYPES.CallExpression) {
    return false;
  }
  const member = calledMember(node);
  if (member === undefined) {
    return false;
  }
  const receiver = unwrapped(member.object);
  const method = memberName(member);
  return (
    receiver.type === AST_NODE_TYPES.Identifier &&
    receiver.name === name &&
    method !== undefined &&
    methods.has(method)
  );
}

export function extractWorklistLoop(loop: WorklistLoopNode): WorklistLoop | undefined {
  const name = worklistNameOf(loop);
  if (name === undefined) {
    return undefined;
  }
  const nodes = loopBodyNodes(loop);
  const appends = nodes.filter((node) => isMethodOn(node, name, APPEND_METHODS));
  if (appends.length === 0) {
    return undefined;
  }
  if (
    loop.type === AST_NODE_TYPES.WhileStatement &&
    !nodes.some((node) => isMethodOn(node, name, REMOVE_METHODS))
  ) {
    return undefined;
  }
  return { loop, name, appends };
}

function isInsideInnerIteration(append: TSESTree.CallExpression, loop: WorklistLoopNode): boolean {
  const path = ancestorsOf(append);
  const loopIndex = path.indexOf(loop);
  return path
    .slice(0, loopIndex)
    .some(
      (node) =>
        INNER_LOOPS.has(node.type) || (isFunction(node) && callbackRole(node) === 'callback'),
    );
}

function hasMultiAppendCall(append: TSESTree.CallExpression, loop: WorklistLoopNode): boolean {
  return (
    append.arguments.length > 1 ||
    append.arguments.some((argument) => argument.type === AST_NODE_TYPES.SpreadElement) ||
    isInsideInnerIteration(append, loop)
  );
}

function areMutuallyExclusive(
  first: TSESTree.CallExpression,
  second: TSESTree.CallExpression,
  loop: WorklistLoopNode,
): boolean {
  const firstAncestors = ancestorsOf(first);
  const secondSet = new Set(ancestorsOf(second));
  const lca = firstAncestors.find((node) => secondSet.has(node));
  if (lca === undefined || !contains(loop.body, lca)) {
    return false;
  }
  if (
    lca.type === AST_NODE_TYPES.IfStatement ||
    lca.type === AST_NODE_TYPES.ConditionalExpression
  ) {
    const alt = lca.alternate;
    return (
      alt !== null &&
      ((contains(lca.consequent, first) && contains(alt, second)) ||
        (contains(lca.consequent, second) && contains(alt, first)))
    );
  }
  if (lca.type === AST_NODE_TYPES.SwitchStatement) {
    const firstCase = lca.cases.find((entry) => contains(entry, first));
    const secondCase = lca.cases.find((entry) => contains(entry, second));
    return firstCase !== undefined && secondCase !== undefined && firstCase !== secondCase;
  }
  return false;
}

export function canAppendMultiple(worklist: WorklistLoop): boolean {
  const { appends, loop } = worklist;
  if (appends.some((append) => hasMultiAppendCall(append, loop))) {
    return true;
  }
  return appends.some((first, index) =>
    appends.slice(index + 1).some((second) => !areMutuallyExclusive(first, second, loop)),
  );
}
