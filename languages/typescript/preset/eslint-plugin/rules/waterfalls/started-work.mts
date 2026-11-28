import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { findVariable, referencesOf } from '../analysis/constant-resolution.mts';
import { nodesOutsideNestedFunctions } from '../react/react-effects.mts';
import { memberRoot, nameOf, nodeChildren, nodesWithoutNested } from '../typed/node-views.mts';
import { calleeNameOf } from '../typed/syntax-views.mts';
import { textOf } from '../../../../../../shared/values/readers.mts';

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

function awaitedArgument(statement: TSESTree.Statement): TSESTree.Node | undefined {
  if (statement.type !== AST_NODE_TYPES.VariableDeclaration) {
    return undefined;
  }
  const [declarator, ...others] = statement.declarations;
  const init = others.length === 0 ? declarator.init : undefined;
  return init?.type === AST_NODE_TYPES.AwaitExpression ? init.argument : undefined;
}

function awaitedTask(statement: TSESTree.Statement): Handle | undefined {
  const argument = awaitedArgument(statement);
  if (argument?.type === AST_NODE_TYPES.Identifier) {
    return argument;
  }
  return argument?.type === AST_NODE_TYPES.MemberExpression && memberPath(argument) !== undefined
    ? argument
    : undefined;
}

function declaratorOf(
  task: TSESTree.Identifier,
  sourceCode: TSESLint.SourceCode,
): TSESTree.VariableDeclarator | undefined {
  const node = findVariable({ sourceCode }, task, task.name)?.defs[0]?.node;
  return node?.type === AST_NODE_TYPES.VariableDeclarator ? node : undefined;
}

function startedEarlier(
  task: TSESTree.Identifier,
  block: TSESTree.BlockStatement,
  sourceCode: TSESLint.SourceCode,
): boolean {
  const declarator = declaratorOf(task, sourceCode);
  return (
    declarator?.parent.kind === 'const' &&
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

function readMember(node: TSESTree.Node, property: string): TSESTree.MemberExpression | undefined {
  const { parent } = node;
  return parent?.type === AST_NODE_TYPES.MemberExpression &&
    parent.object === node &&
    !parent.computed &&
    parent.property.type === AST_NODE_TYPES.Identifier &&
    parent.property.name !== property
    ? parent
    : undefined;
}

function isCalledOrChanged(member: TSESTree.MemberExpression): boolean {
  const user = member.parent;
  return (
    (user.type === AST_NODE_TYPES.CallExpression && user.callee === member) ||
    (user.type === AST_NODE_TYPES.AssignmentExpression && user.left === member) ||
    user.type === AST_NODE_TYPES.UpdateExpression
  );
}

function isPlainRead(node: TSESTree.Node, property: string): boolean {
  const member = readMember(node, property);
  return member !== undefined && !isCalledOrChanged(member);
}

function touchesOwner(statement: TSESTree.Statement, handle: TSESTree.MemberExpression): boolean {
  const ownerPath = memberPath(handle.object);
  const property = textOf(nameOf(handle.property));
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
  const path = textOf(memberPath(handle));
  const before = block.body.slice(0, index);
  const start = before.findLastIndex((statement) => mentions(statement, path));
  return (
    memberStart(before[start], path) &&
    !before.slice(start + 1).some((statement) => touchesOwner(statement, handle))
  );
}

function readsAny(
  statement: TSESTree.Statement,
  references: readonly TSESLint.Scope.Reference[],
): boolean {
  const [start, end] = statement.range;
  return references.some(
    (reference) =>
      !reference.init &&
      reference.identifier.range[0] >= start &&
      reference.identifier.range[1] <= end,
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
    const path = textOf(memberPath(handle));
    return memberStartedEarlier(block, index, handle)
      ? (statement) => mentions(statement, path) || touchesOwner(statement, handle)
      : undefined;
  }
  if (!startedEarlier(handle, block, sourceCode)) {
    return undefined;
  }
  const references = referencesOf({ sourceCode }, handle, handle.name);
  return (statement) => readsAny(statement, references);
}

function nextAfterWait(
  later: readonly TSESTree.Statement[],
  result: readonly TSESLint.Scope.Reference[],
  usesTask: Between,
): TSESTree.Statement | undefined {
  const firstUse = later.findIndex((statement) => readsAny(statement, result));
  const between = later.slice(0, firstUse);
  const [next] = between;
  return firstUse >= MIN_GAP - 1 &&
    between.some(doesWork) &&
    !between.some(leaves) &&
    !between.some(usesTask)
    ? next
    : undefined;
}

type WaitSite = {
  readonly wait: TSESTree.Statement;
  readonly index: number;
  readonly block: TSESTree.BlockStatement;
  readonly sourceCode: TSESLint.SourceCode;
};

function earlyWaitAt({ wait, index, block, sourceCode }: WaitSite): EarlyWait | undefined {
  const handle = awaitedTask(wait);
  if (wait.type !== AST_NODE_TYPES.VariableDeclaration || handle === undefined) {
    return undefined;
  }
  const usesTask = blocksTask({ handle, block, index, sourceCode });
  if (usesTask === undefined) {
    return undefined;
  }
  const later = block.body.slice(index + 1);
  const next = nextAfterWait(
    later,
    sourceCode.getDeclaredVariables(wait).flatMap((variable) => variable.references),
    usesTask,
  );
  return next === undefined ? undefined : { wait, task: sourceCode.getText(handle), handle, next };
}

export function earlyWaits(
  block: TSESTree.BlockStatement,
  sourceCode: TSESLint.SourceCode,
): EarlyWait[] {
  return block.body.flatMap((wait, index) => {
    const found = earlyWaitAt({ wait, index, block, sourceCode });
    return found === undefined ? [] : [found];
  });
}
