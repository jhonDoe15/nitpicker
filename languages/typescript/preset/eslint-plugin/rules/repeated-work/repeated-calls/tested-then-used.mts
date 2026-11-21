import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { chainOf, contains, nodeChildren, type SourceCode } from '../../typed/node-views.mts';
import { unwrapped } from '../../typed/syntax-views.mts';
import { isCostlyPureLooking, isFsCall, isSettled, sameCall } from './call-shapes.mts';

export type Pair = {
  readonly first: TSESTree.CallExpression;
  readonly second: TSESTree.CallExpression;
};

const SPINE_UNARY = new Set(['!', 'typeof', '-', '+', 'void']);

function spineStep(node: TSESTree.Node): TSESTree.Node | undefined {
  if (node.type === AST_NODE_TYPES.MemberExpression) {
    return node.object;
  }
  if (node.type === AST_NODE_TYPES.CallExpression) {
    return node.callee;
  }
  if (
    node.type === AST_NODE_TYPES.BinaryExpression ||
    node.type === AST_NODE_TYPES.LogicalExpression
  ) {
    return node.left;
  }
  if (node.type === AST_NODE_TYPES.UnaryExpression) {
    return SPINE_UNARY.has(node.operator) ? node.argument : undefined;
  }
  if (node.type === AST_NODE_TYPES.AwaitExpression) {
    return node.argument;
  }
  return node.type === AST_NODE_TYPES.ChainExpression ||
    node.type === AST_NODE_TYPES.TSNonNullExpression ||
    node.type === AST_NODE_TYPES.TSAsExpression ||
    node.type === AST_NODE_TYPES.TSSatisfiesExpression
    ? node.expression
    : undefined;
}

function spineCalls(expression: TSESTree.Node | undefined): TSESTree.CallExpression[] {
  return chainOf<TSESTree.Node>(expression, spineStep).filter(
    (node): node is TSESTree.CallExpression => node.type === AST_NODE_TYPES.CallExpression,
  );
}

function lastTested(test: TSESTree.Node): TSESTree.Node {
  const steps = chainOf<TSESTree.Node>(test, (node) => {
    const value = unwrapped(node);
    return value.type === AST_NODE_TYPES.LogicalExpression ? value.right : undefined;
  });
  return unwrapped(steps.at(-1) ?? test);
}

function settledAround(node: TSESTree.Node, inner: TSESTree.Node): boolean {
  const pending = [node];
  for (const item of pending) {
    if (item === inner) {
      return true;
    }
    const toward = spineStep(item);
    if (
      toward === undefined ||
      !contains(toward, inner) ||
      !nodeChildren(item).every((child) => child === toward || isSettled(child))
    ) {
      return false;
    }
    pending.push(toward);
  }
  return false;
}

function firstUse(statement: TSESTree.Statement): TSESTree.Node | undefined {
  const value = statement.type === AST_NODE_TYPES.BlockStatement ? statement.body.at(0) : statement;
  if (value?.type === AST_NODE_TYPES.ExpressionStatement) {
    return value.expression;
  }
  if (
    value?.type === AST_NODE_TYPES.ReturnStatement ||
    value?.type === AST_NODE_TYPES.ThrowStatement
  ) {
    return value.argument ?? undefined;
  }
  return value?.type === AST_NODE_TYPES.VariableDeclaration
    ? (value.declarations.at(0)?.init ?? undefined)
    : undefined;
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
  const steps = chainOf<TSESTree.Node>(call, (node) =>
    node.parent !== undefined && WRAPPERS.has(node.parent.type) ? node.parent : undefined,
  );
  return steps.at(-1) ?? call;
}

function comparesItself(node: TSESTree.Node, call: TSESTree.Node): boolean {
  if (node.type === AST_NODE_TYPES.BinaryExpression) {
    return node.left === wrapped(call) && !(EQUALITY.has(node.operator) && isNullish(node.right));
  }
  return (
    node.type === AST_NODE_TYPES.UnaryExpression &&
    node.operator !== '!' &&
    node.argument === wrapped(call)
  );
}

function testsPresence(test: TSESTree.Node, call: TSESTree.Node): boolean {
  const spine = chainOf<TSESTree.Node>(test, spineStep);
  const end = spine.indexOf(call);
  return !(end === -1 ? spine : spine.slice(0, end)).some((node) => comparesItself(node, call));
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
