import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { findVariable } from '../analysis/constant-resolution.mts';
import { nodesOutsideNestedFunctions } from '../react/react-effects.mts';
import { memberRoot } from '../typed/node-views.mts';
import { calleeNameOf } from '../typed/syntax-views.mts';

export type EarlyWait = {
  readonly wait: TSESTree.VariableDeclaration;
  readonly task: string;
  readonly handle: TSESTree.Identifier;
  readonly next: TSESTree.Statement;
};

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

function awaitedTask(statement: TSESTree.Statement): TSESTree.Identifier | undefined {
  if (statement.type !== AST_NODE_TYPES.VariableDeclaration) {
    return undefined;
  }
  const [declarator, ...others] = statement.declarations;
  const init = others.length === 0 ? declarator.init : undefined;
  return init?.type === AST_NODE_TYPES.AwaitExpression &&
    init.argument.type === AST_NODE_TYPES.Identifier
    ? init.argument
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

function earlyWaitAt(
  block: TSESTree.BlockStatement,
  index: number,
  sourceCode: TSESLint.SourceCode,
): EarlyWait | undefined {
  const wait = block.body[index];
  const task = wait === undefined ? undefined : awaitedTask(wait);
  if (wait?.type !== AST_NODE_TYPES.VariableDeclaration || task === undefined) {
    return undefined;
  }
  if (!startedEarlier(task, block, sourceCode)) {
    return undefined;
  }
  const result = sourceCode.getDeclaredVariables(wait);
  const taskVariable = findVariable({ sourceCode }, task, task.name);
  const taskVariables = taskVariable === undefined ? [] : [taskVariable];
  const later = block.body.slice(index + 1);
  const firstUse = later.findIndex((statement) => readsAny(statement, result));
  const between = later.slice(0, firstUse);
  const [next] = between;
  return firstUse >= MIN_GAP - 1 &&
    next !== undefined &&
    between.some(doesWork) &&
    !between.some(leaves) &&
    !between.some((statement) => readsAny(statement, taskVariables))
    ? { wait, task: task.name, handle: task, next }
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
