import { AST_NODE_TYPES, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { findVariable } from '../../analysis/constant-resolution.mts';
import type { Context } from '../../security/security-values.mts';
import { ancestorsOf, nameOf } from '../../typed/node-views.mts';
import { isFunction } from '../../typed/syntax-views.mts';

const { DefinitionType } = TSESLint.Scope;

type Flow = TSESTree.Node[] | undefined;
type Variable = TSESLint.Scope.Variable;
type Walk = { readonly context: Context; readonly seen: Set<Variable> };

const SINKS = new Set([
  'save',
  'insert',
  'upsert',
  'merge',
  'persist',
  'remove',
  'softRemove',
  'recover',
]);
const COLLECTORS = new Set(['push', 'unshift']);
const CALLBACKS = new Set(['map', 'flatMap']);
const EXECUTING = new Set(['then', 'catch', 'finally']);
const WRAPPERS = new Set<string>([
  AST_NODE_TYPES.ChainExpression,
  AST_NODE_TYPES.TSNonNullExpression,
  AST_NODE_TYPES.TSAsExpression,
  AST_NODE_TYPES.TSSatisfiesExpression,
  AST_NODE_TYPES.ArrayExpression,
]);
const MAX_STEPS = 200;

function methodOf(call: TSESTree.CallExpression): string | undefined {
  const { callee } = call;
  return callee.type === AST_NODE_TYPES.MemberExpression && !callee.computed
    ? nameOf(callee.property)
    : undefined;
}

function isLocal(variable: Variable): boolean {
  const definition = variable.defs.length === 1 ? variable.defs[0] : undefined;
  return (
    definition?.type === DefinitionType.Variable &&
    definition.parent.parent.type !== AST_NODE_TYPES.ExportNamedDeclaration
  );
}

function readsOf(variable: Variable | undefined, seen: Set<Variable>): Flow {
  if (variable === undefined || !isLocal(variable)) {
    return undefined;
  }
  if (seen.has(variable)) {
    return [];
  }
  seen.add(variable);
  return variable.references
    .filter((reference) => !(reference.init || reference.isWrite()))
    .map((reference) => reference.identifier);
}

function argumentFlow(call: TSESTree.CallExpression, context: Context, seen: Set<Variable>): Flow {
  const method = methodOf(call);
  if (method !== undefined && SINKS.has(method)) {
    return [];
  }
  const { callee } = call;
  const receiver = callee.type === AST_NODE_TYPES.MemberExpression ? callee.object : undefined;
  if (
    method === undefined ||
    !COLLECTORS.has(method) ||
    receiver?.type !== AST_NODE_TYPES.Identifier
  ) {
    return undefined;
  }
  return readsOf(findVariable(context, receiver, receiver.name), seen);
}

function memberFlow(member: TSESTree.MemberExpression, node: TSESTree.Node): Flow {
  const name = nameOf(member.property);
  const called =
    member.parent.type === AST_NODE_TYPES.CallExpression && member.parent.callee === member;
  if (member.object !== node || member.computed || name === undefined || EXECUTING.has(name)) {
    return undefined;
  }
  return !called || COLLECTORS.has(name) ? [] : undefined;
}

function callbackFlow(fn: TSESTree.Node): Flow {
  const call = fn.parent;
  const method = call?.type === AST_NODE_TYPES.CallExpression ? methodOf(call) : undefined;
  const sync = isFunction(fn) && !fn.async;
  return sync && method !== undefined && CALLBACKS.has(method) && call !== undefined
    ? [call]
    : undefined;
}

function returnFlow(node: TSESTree.Node, first: boolean): Flow {
  const fn = ancestorsOf(node).find(isFunction);
  const callback = fn === undefined ? undefined : callbackFlow(fn);
  if (callback !== undefined) {
    return callback;
  }
  return first ? undefined : [];
}

function assignedFlow(target: TSESTree.Node, context: Context, seen: Set<Variable>): Flow {
  return target.type === AST_NODE_TYPES.Identifier
    ? readsOf(findVariable(context, target, target.name), seen)
    : undefined;
}

function declaredFlow(
  declarator: TSESTree.VariableDeclarator,
  context: Context,
  seen: Set<Variable>,
): Flow {
  return declarator.id.type === AST_NODE_TYPES.Identifier
    ? readsOf(context.sourceCode.getDeclaredVariables(declarator).at(0), seen)
    : undefined;
}

function operandFlow(parent: TSESTree.Node, node: TSESTree.Node, walk: Walk): Flow {
  if (parent.type === AST_NODE_TYPES.CallExpression) {
    return parent.callee === node ? undefined : argumentFlow(parent, walk.context, walk.seen);
  }
  if (parent.type === AST_NODE_TYPES.VariableDeclarator) {
    return parent.init === node ? declaredFlow(parent, walk.context, walk.seen) : undefined;
  }
  if (parent.type === AST_NODE_TYPES.AssignmentExpression) {
    return parent.right === node ? assignedFlow(parent.left, walk.context, walk.seen) : undefined;
  }
  return undefined;
}

function stepOf(node: TSESTree.Node, first: boolean, walk: Walk): Flow {
  const { parent } = node;
  if (parent === undefined) {
    return undefined;
  }
  if (WRAPPERS.has(parent.type)) {
    return [parent];
  }
  if (parent.type === AST_NODE_TYPES.MemberExpression) {
    return memberFlow(parent, node);
  }
  if (parent.type === AST_NODE_TYPES.ReturnStatement) {
    return returnFlow(node, first);
  }
  if (parent.type === AST_NODE_TYPES.ArrowFunctionExpression) {
    return parent.body === node ? callbackFlow(parent) : undefined;
  }
  if (parent.type === AST_NODE_TYPES.UnaryExpression) {
    return parent.operator === 'void' ? [] : undefined;
  }
  return operandFlow(parent, node, walk);
}

export function staysEntity(call: TSESTree.CallExpression, context: Context): boolean {
  const pending: TSESTree.Node[] = [call];
  const walk = { context, seen: new Set<Variable>() };
  for (const [index, node] of pending.entries()) {
    const next = index < MAX_STEPS ? stepOf(node, index === 0, walk) : undefined;
    if (next === undefined) {
      return false;
    }
    for (const following of next) {
      pending.push(following);
    }
  }
  return true;
}
