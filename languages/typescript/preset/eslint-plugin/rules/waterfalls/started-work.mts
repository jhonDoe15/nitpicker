import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { findVariable } from '../analysis/constant-resolution.mts';
import { nodesOutsideNestedFunctions } from '../react/react-effects.mts';
import { memberRoot, nodeChildren, nodesWithoutNested } from '../typed/node-views.mts';
import { calleeNameOf } from '../typed/syntax-views.mts';

type Handle = TSESTree.Identifier | TSESTree.MemberExpression;

export type EarlyWait = {
  readonly wait: TSESTree.VariableDeclaration;
  readonly task: string;
  readonly handle: Handle;
  readonly next: TSESTree.Statement;
};

type Between = (statement: TSESTree.Statement) => boolean;

const MIN_GAP = 3;
const ACCESSOR = /^(?:get|is|has)(?:[A-Z]|$)|^(?:join|log|trace|debug|info|warn|error)$/u;
const CHEAP_RECEIVERS = new Set(['console', 'logger', 'log', 'Math', 'JSON']);

function isCheapCall(call: TSESTree.CallExpression): boolean {
  const { callee } = call;
  const receiver =
    callee.type === AST_NODE_TYPES.MemberExpression ? memberRoot(callee.object) : undefined;
  return (
    ACCESSOR.test(calleeNameOf(callee) ?? 'get') ||
    (receiver?.type === AST_NODE_TYPES.Identifier && CHEAP_RECEIVERS.has(receiver.name))
  );
}

function memberPath(node: TSESTree.Node): string | undefined {
  const names: string[] = [];
  const pending = [node];
  for (const current of pending) {
    if (current.type === AST_NODE_TYPES.ThisExpression) {
      return ['this', ...names].join('.');
    }
    if (current.type === AST_NODE_TYPES.Identifier) {
      return [current.name, ...names].join('.');
    }
    if (
      current.type !== AST_NODE_TYPES.MemberExpression ||
      current.computed ||
      current.property.type !== AST_NODE_TYPES.Identifier
    ) {
      return undefined;
    }
    names.unshift(current.property.name);
    pending.push(current.object);
  }
  return undefined;
}

function awaitedTask(statement: TSESTree.Statement): Handle | undefined {
  if (statement.type !== AST_NODE_TYPES.VariableDeclaration) {
    return undefined;
  }
  const [declarator, ...others] = statement.declarations;
  const init = others.length === 0 ? declarator.init : undefined;
  const argument = init?.type === AST_NODE_TYPES.AwaitExpression ? init.argument : undefined;
  if (argument?.type === AST_NODE_TYPES.Identifier) {
    return argument;
  }
  return argument?.type === AST_NODE_TYPES.MemberExpression && memberPath(argument) !== undefined
    ? argument
    : undefined;
}

function startedEarlier(
  task: TSESTree.Identifier,
  block: TSESTree.BlockStatement,
  sourceCode: TSESLint.SourceCode,
): boolean {
  const definition = findVariable({ sourceCode }, task, task.name)?.defs[0];
  const declarator = definition?.node;
  return (
    declarator?.type === AST_NODE_TYPES.VariableDeclarator &&
    declarator.parent.kind === 'const' &&
    declarator.parent.parent === block &&
    (declarator.init?.type === AST_NODE_TYPES.CallExpression ||
      declarator.init?.type === AST_NODE_TYPES.NewExpression)
  );
}

function allNodes(root: TSESTree.Node): TSESTree.Node[] {
  return nodesWithoutNested(root, new Set(), nodeChildren);
}

function mentions(statement: TSESTree.Statement, path: string): boolean {
  return allNodes(statement).some(
    (node) => node.type === AST_NODE_TYPES.MemberExpression && memberPath(node) === path,
  );
}

function memberStart(statement: TSESTree.Statement | undefined, path: string): boolean {
  const assignment =
    statement?.type === AST_NODE_TYPES.ExpressionStatement ? statement.expression : undefined;
  return (
    assignment?.type === AST_NODE_TYPES.AssignmentExpression &&
    assignment.operator === '=' &&
    memberPath(assignment.left) === path &&
    (assignment.right.type === AST_NODE_TYPES.CallExpression ||
      assignment.right.type === AST_NODE_TYPES.NewExpression)
  );
}

function isPlainRead(node: TSESTree.Node, property: string): boolean {
  const { parent } = node;
  if (
    parent?.type !== AST_NODE_TYPES.MemberExpression ||
    parent.object !== node ||
    parent.computed ||
    parent.property.type !== AST_NODE_TYPES.Identifier ||
    parent.property.name === property
  ) {
    return false;
  }
  const user = parent.parent;
  return !(
    (user.type === AST_NODE_TYPES.CallExpression && user.callee === parent) ||
    (user.type === AST_NODE_TYPES.AssignmentExpression && user.left === parent) ||
    user.type === AST_NODE_TYPES.UpdateExpression
  );
}

function touchesOwner(statement: TSESTree.Statement, handle: TSESTree.MemberExpression): boolean {
  const ownerPath = memberPath(handle.object);
  const property = handle.property.type === AST_NODE_TYPES.Identifier ? handle.property.name : '';
  return allNodes(statement).some(
    (node) =>
      (node.type === AST_NODE_TYPES.ThisExpression ||
        node.type === AST_NODE_TYPES.Identifier ||
        node.type === AST_NODE_TYPES.MemberExpression) &&
      memberPath(node) === ownerPath &&
      !isPlainRead(node, property),
  );
}

function memberStartedEarlier(
  block: TSESTree.BlockStatement,
  index: number,
  handle: TSESTree.MemberExpression,
): boolean {
  const path = memberPath(handle) ?? '';
  const before = block.body.slice(0, index);
  const start = before.findLastIndex((statement) => mentions(statement, path));
  return (
    memberStart(before[start], path) &&
    !before.slice(start + 1).some((statement) => touchesOwner(statement, handle))
  );
}

function readsAny(
  statement: TSESTree.Statement,
  variables: readonly TSESLint.Scope.Variable[],
): boolean {
  const [start, end] = statement.range;
  return variables.some((variable) =>
    variable.references.some(
      (reference) =>
        !reference.init &&
        reference.identifier.range[0] >= start &&
        reference.identifier.range[1] <= end,
    ),
  );
}

function doesWork(statement: TSESTree.Statement): boolean {
  return nodesOutsideNestedFunctions(statement).some(
    (node) => node.type === AST_NODE_TYPES.CallExpression && !isCheapCall(node),
  );
}

function leaves(statement: TSESTree.Statement): boolean {
  return nodesOutsideNestedFunctions(statement).some(
    (node) =>
      node.type === AST_NODE_TYPES.ReturnStatement ||
      node.type === AST_NODE_TYPES.ThrowStatement ||
      node.type === AST_NODE_TYPES.BreakStatement ||
      node.type === AST_NODE_TYPES.ContinueStatement,
  );
}

type TaskQuery = {
  readonly handle: Handle;
  readonly block: TSESTree.BlockStatement;
  readonly index: number;
  readonly sourceCode: TSESLint.SourceCode;
};

function blocksTask({ handle, block, index, sourceCode }: TaskQuery): Between | undefined {
  if (handle.type === AST_NODE_TYPES.MemberExpression) {
    const path = memberPath(handle) ?? '';
    return memberStartedEarlier(block, index, handle)
      ? (statement) => mentions(statement, path) || touchesOwner(statement, handle)
      : undefined;
  }
  if (!startedEarlier(handle, block, sourceCode)) {
    return undefined;
  }
  const variable = findVariable({ sourceCode }, handle, handle.name);
  const variables = variable === undefined ? [] : [variable];
  return (statement) => readsAny(statement, variables);
}

function earlyWaitAt(
  block: TSESTree.BlockStatement,
  index: number,
  sourceCode: TSESLint.SourceCode,
): EarlyWait | undefined {
  const wait = block.body[index];
  const handle = wait === undefined ? undefined : awaitedTask(wait);
  if (wait?.type !== AST_NODE_TYPES.VariableDeclaration || handle === undefined) {
    return undefined;
  }
  const usesTask = blocksTask({ handle, block, index, sourceCode });
  if (usesTask === undefined) {
    return undefined;
  }
  const result = sourceCode.getDeclaredVariables(wait);
  const later = block.body.slice(index + 1);
  const firstUse = later.findIndex((statement) => readsAny(statement, result));
  const between = later.slice(0, firstUse);
  const [next] = between;
  return firstUse >= MIN_GAP - 1 &&
    next !== undefined &&
    between.some(doesWork) &&
    !between.some(leaves) &&
    !between.some(usesTask)
    ? { wait, task: sourceCode.getText(handle), handle, next }
    : undefined;
}

export function earlyWaits(
  block: TSESTree.BlockStatement,
  sourceCode: TSESLint.SourceCode,
): EarlyWait[] {
  return block.body.flatMap((_, index) => {
    const found = earlyWaitAt(block, index, sourceCode);
    return found === undefined ? [] : [found];
  });
}
