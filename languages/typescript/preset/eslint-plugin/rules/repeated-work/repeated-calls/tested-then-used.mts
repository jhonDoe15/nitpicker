import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { contains, nodeChildren, type SourceCode } from '../../typed/node-views.mts';
import { unwrapped } from '../../typed/syntax-views.mts';
import { isCostlyPureLooking, isFsCall, isSettled, sameCall } from './call-shapes.mts';

export type Pair = {
  readonly first: TSESTree.CallExpression;
  readonly second: TSESTree.CallExpression;
};

const SPINE_UNARY = new Set(['!', 'typeof', '-', '+', 'void']);

function spineStep(node: TSESTree.Node): TSESTree.Node | undefined {
  switch (node.type) {
    case AST_NODE_TYPES.MemberExpression:
      return node.object;
    case AST_NODE_TYPES.CallExpression:
      return node.callee;
    case AST_NODE_TYPES.BinaryExpression:
    case AST_NODE_TYPES.LogicalExpression:
      return node.left;
    case AST_NODE_TYPES.UnaryExpression:
      return SPINE_UNARY.has(node.operator) ? node.argument : undefined;
    case AST_NODE_TYPES.AwaitExpression:
    case AST_NODE_TYPES.ChainExpression:
    case AST_NODE_TYPES.TSNonNullExpression:
    case AST_NODE_TYPES.TSAsExpression:
    case AST_NODE_TYPES.TSSatisfiesExpression:
      return 'argument' in node ? node.argument : node.expression;
    default:
      return undefined;
  }
}

function spineCalls(expression: TSESTree.Node | null | undefined): TSESTree.CallExpression[] {
  const calls: TSESTree.CallExpression[] = [];
  for (let node = expression ?? undefined; node !== undefined; node = spineStep(node)) {
    if (node.type === AST_NODE_TYPES.CallExpression) {
      calls.push(node);
    }
  }
  return calls;
}

function lastTested(test: TSESTree.Node): TSESTree.Node {
  const value = unwrapped(test);
  return value.type === AST_NODE_TYPES.LogicalExpression ? lastTested(value.right) : value;
}

function settledAround(node: TSESTree.Node, inner: TSESTree.Node): boolean {
  if (node === inner) {
    return true;
  }
  const toward = spineStep(node);
  if (toward === undefined || !contains(toward, inner)) {
    return false;
  }
  return (
    nodeChildren(node).every((child) => child === toward || isSettled(child)) &&
    settledAround(toward, inner)
  );
}

function firstUse(statement: TSESTree.Statement): TSESTree.Node | undefined {
  const value = statement.type === AST_NODE_TYPES.BlockStatement ? statement.body[0] : statement;
  switch (value?.type) {
    case AST_NODE_TYPES.ExpressionStatement:
      return value.expression;
    case AST_NODE_TYPES.ReturnStatement:
    case AST_NODE_TYPES.ThrowStatement:
      return value.argument ?? undefined;
    case AST_NODE_TYPES.VariableDeclaration:
      return value.declarations[0]?.init ?? undefined;
    default:
      return undefined;
  }
}

function usesOf(node: TSESTree.Node): [TSESTree.Node, (TSESTree.Node | undefined)[]] | undefined {
  if (node.type === AST_NODE_TYPES.LogicalExpression) {
    return [node.left, [node.right]];
  }
  if (node.type === AST_NODE_TYPES.ConditionalExpression) {
    return [node.test, [node.consequent, node.alternate]];
  }
  if (node.type === AST_NODE_TYPES.IfStatement) {
    return [
      node.test,
      [firstUse(node.consequent), node.alternate ? firstUse(node.alternate) : undefined],
    ];
  }
  return undefined;
}

const EQUALITY = new Set(['===', '!==', '==', '!=']);

function isNullish(node: TSESTree.Node): boolean {
  const value = unwrapped(node);
  return (
    (value.type === AST_NODE_TYPES.Literal && value.value === null) ||
    (value.type === AST_NODE_TYPES.Identifier && value.name === 'undefined') ||
    (value.type === AST_NODE_TYPES.UnaryExpression && value.operator === 'void')
  );
}

const WRAPPERS = new Set<string>([
  AST_NODE_TYPES.AwaitExpression,
  AST_NODE_TYPES.ChainExpression,
  AST_NODE_TYPES.TSAsExpression,
  AST_NODE_TYPES.TSNonNullExpression,
  AST_NODE_TYPES.TSSatisfiesExpression,
]);

function wrapped(call: TSESTree.Node): TSESTree.Node {
  let outer = call;
  while (outer.parent !== undefined && WRAPPERS.has(outer.parent.type)) {
    outer = outer.parent;
  }
  return outer;
}

function comparesItself(node: TSESTree.Node, call: TSESTree.Node): boolean {
  if (node.type === AST_NODE_TYPES.BinaryExpression) {
    return node.left === wrapped(call) && (!EQUALITY.has(node.operator) || !isNullish(node.right));
  }
  return (
    node.type === AST_NODE_TYPES.UnaryExpression &&
    node.operator !== '!' &&
    node.argument === wrapped(call)
  );
}

function testsPresence(test: TSESTree.Node, call: TSESTree.Node): boolean {
  for (
    let node: TSESTree.Node | undefined = test;
    node !== undefined && node !== call;
    node = spineStep(node)
  ) {
    if (comparesItself(node, call)) {
      return false;
    }
  }
  return true;
}

function usedAsValue(use: TSESTree.Node, call: TSESTree.Node): boolean {
  const outer = wrapped(call);
  const { parent } = outer;
  return (
    outer === use || (parent?.type === AST_NODE_TYPES.MemberExpression && parent.object === outer)
  );
}

export function testedThenUsed(sourceCode: SourceCode, node: TSESTree.Node): Pair | undefined {
  const parts = usesOf(node);
  if (parts === undefined) {
    return undefined;
  }
  const tested = lastTested(parts[0]);
  const candidates = spineCalls(tested).filter(
    (call) =>
      isCostlyPureLooking(sourceCode, call) &&
      call.parent.type !== AST_NODE_TYPES.AwaitExpression &&
      !isFsCall(sourceCode, unwrapped(call.callee)) &&
      settledAround(tested, call) &&
      testsPresence(tested, call),
  );
  for (const use of parts[1]) {
    const second = spineCalls(use).find(
      (call) =>
        use !== undefined &&
        usedAsValue(use, call) &&
        candidates.some((first) => sameCall(sourceCode, first, call)),
    );
    const first = candidates.find(
      (call) => second !== undefined && sameCall(sourceCode, call, second),
    );
    if (first !== undefined && second !== undefined) {
      return { first, second };
    }
  }
  return undefined;
}
