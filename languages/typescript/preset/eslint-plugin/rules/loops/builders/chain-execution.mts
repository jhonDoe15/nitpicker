import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import type { Context } from '../../security/security-values.mts';
import { findVariable } from '../../analysis/constant-resolution.mts';
import { isTerminalMethod } from '../../support/flow/consumed.mts';
import { chainOf, nameOf } from '../../typed/node-views.mts';
import { enclosingFunction } from '../../typed/syntax-views.mts';

export type Call = TSESTree.CallExpression | TSESTree.TaggedTemplateExpression;
const EXECUTED = 'executed';
const UNKNOWN = 'unknown';

export type Execution = typeof EXECUTED | 'unexecuted' | typeof UNKNOWN;
type Direct = Execution | 'variable';

const PROMISE_STEPS = new Set(['then', 'catch', 'finally', 'run', 'all', 'execute']);
const COMBINATORS = new Set(['all', 'allSettled', 'any', 'race']);
const COLLECTORS = new Set(['push', 'unshift']);
const WRAPPERS = new Set<string>([
  AST_NODE_TYPES.ChainExpression,
  AST_NODE_TYPES.TSNonNullExpression,
  AST_NODE_TYPES.TSAsExpression,
  AST_NODE_TYPES.TSSatisfiesExpression,
]);

function isChainStep(node: TSESTree.Node, parent: TSESTree.Node): boolean {
  return (
    (parent.type === AST_NODE_TYPES.MemberExpression && parent.object === node) ||
    (parent.type === AST_NODE_TYPES.CallExpression && parent.callee === node) ||
    (parent.type === AST_NODE_TYPES.TaggedTemplateExpression && parent.tag === node) ||
    WRAPPERS.has(parent.type)
  );
}

function chainParent(link: TSESTree.Node): TSESTree.Node | undefined {
  const { parent } = link;
  return parent !== undefined && isChainStep(link, parent) ? parent : undefined;
}

export function chainFrom(node: TSESTree.Node): TSESTree.Node[] {
  return chainOf<TSESTree.Node>(node, chainParent);
}

function nextLink(node: TSESTree.Node): TSESTree.Node | undefined {
  if (node.type === AST_NODE_TYPES.MemberExpression) {
    return node.object;
  }
  return node.type === AST_NODE_TYPES.CallExpression ? node.callee : undefined;
}

export function innerCalls(call: Call): Call[] {
  const start = call.type === AST_NODE_TYPES.CallExpression ? call.callee : undefined;
  return chainOf<TSESTree.Node>(start, nextLink).filter(
    (link) => link.type === AST_NODE_TYPES.CallExpression,
  );
}

export function outerCalls(call: Call): Call[] {
  return chainFrom(call)
    .slice(1)
    .filter(
      (link): link is Call =>
        link.type === AST_NODE_TYPES.CallExpression ||
        link.type === AST_NODE_TYPES.TaggedTemplateExpression,
    );
}

export function chainArguments(call: Call): TSESTree.Node[] {
  return [call, ...innerCalls(call), ...outerCalls(call)].flatMap((each) =>
    each.type === AST_NODE_TYPES.CallExpression ? each.arguments : [],
  );
}

function isExecutingStep(link: TSESTree.Node): boolean {
  const method =
    link.type === AST_NODE_TYPES.MemberExpression && !link.computed
      ? nameOf(link.property)
      : undefined;
  return method !== undefined && (PROMISE_STEPS.has(method) || isTerminalMethod(method));
}

function calleeMethod(call: TSESTree.CallExpression): string | undefined {
  const { callee } = call;
  return callee.type === AST_NODE_TYPES.MemberExpression ? nameOf(callee.property) : undefined;
}

function isCombinatorCall(node: TSESTree.Node | undefined): boolean {
  if (node?.type !== AST_NODE_TYPES.CallExpression) {
    return false;
  }
  const method = calleeMethod(node);
  const { callee } = node;
  return (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    nameOf(callee.object) === 'Promise' &&
    method !== undefined &&
    COMBINATORS.has(method)
  );
}

function isCombinatorArgument(top: TSESTree.Node): boolean {
  const { parent } = top;
  const host = parent?.type === AST_NODE_TYPES.ArrayExpression ? parent.parent : parent;
  return isCombinatorCall(host);
}

function isCollected(top: TSESTree.Node): boolean {
  const { parent } = top;
  const method = parent?.type === AST_NODE_TYPES.CallExpression ? calleeMethod(parent) : undefined;
  return method !== undefined && COLLECTORS.has(method);
}

function isIteration(call: TSESTree.Node | undefined): call is TSESTree.CallExpression {
  return call?.type === AST_NODE_TYPES.CallExpression && calleeMethod(call) !== undefined;
}

function callbackResult(fn: TSESTree.ArrowFunctionExpression): Direct {
  if (fn.async) {
    return EXECUTED;
  }
  const call = fn.parent;
  const links = isIteration(call) ? chainFrom(call) : [];
  const top = links.at(-1);
  if (top === undefined) {
    return UNKNOWN;
  }
  return top.parent?.type === AST_NODE_TYPES.AwaitExpression || isCombinatorArgument(top)
    ? EXECUTED
    : UNKNOWN;
}

function returned(top: TSESTree.Node): Direct {
  return enclosingFunction(top)?.async === true ? EXECUTED : UNKNOWN;
}

function isDiscardedArgument(top: TSESTree.Node): boolean {
  const { parent } = top;
  return (
    parent?.type === AST_NODE_TYPES.Property ||
    (parent?.type === AST_NODE_TYPES.CallExpression &&
      parent.arguments.some((argument) => argument === top))
  );
}

function assignmentTarget(top: TSESTree.Node): TSESTree.Node | undefined {
  const { parent } = top;
  if (parent?.type === AST_NODE_TYPES.VariableDeclarator && parent.init === top) {
    return parent.id;
  }
  return parent?.type === AST_NODE_TYPES.AssignmentExpression && parent.right === top
    ? parent.left
    : undefined;
}

function directExecution(node: TSESTree.Node): Direct {
  const links = chainFrom(node);
  const top = links.at(-1) ?? node;
  const { parent } = top;
  if (links.some(isExecutingStep) || parent?.type === AST_NODE_TYPES.AwaitExpression) {
    return EXECUTED;
  }
  if (parent?.type === AST_NODE_TYPES.ReturnStatement) {
    return returned(top);
  }
  if (parent?.type === AST_NODE_TYPES.ArrowFunctionExpression && parent.body === top) {
    return callbackResult(parent);
  }
  if (isCombinatorArgument(top)) {
    return EXECUTED;
  }
  const target = assignmentTarget(top);
  if (target !== undefined) {
    return target.type === AST_NODE_TYPES.Identifier ? 'variable' : EXECUTED;
  }
  return !isCollected(top) && isDiscardedArgument(top) ? 'unexecuted' : UNKNOWN;
}

function assignedVariable(top: TSESTree.Node, context: Context) {
  const { parent } = top;
  if (parent?.type === AST_NODE_TYPES.VariableDeclarator) {
    return context.sourceCode.getDeclaredVariables(parent).at(0);
  }
  const target = parent?.type === AST_NODE_TYPES.AssignmentExpression ? parent.left : undefined;
  return target?.type === AST_NODE_TYPES.Identifier
    ? findVariable(context, target, target.name)
    : undefined;
}

function isRunLater(variable: ReturnType<typeof assignedVariable>): boolean {
  return (variable?.references ?? []).some(
    (reference) =>
      !reference.init && !reference.isWrite() && directExecution(reference.identifier) === EXECUTED,
  );
}

export function executionOf(call: Call, context: Context): Execution {
  const direct = directExecution(call);
  if (direct !== 'variable') {
    return direct;
  }
  const top = chainFrom(call).at(-1) ?? call;
  return isRunLater(assignedVariable(top, context)) ? EXECUTED : 'unexecuted';
}
