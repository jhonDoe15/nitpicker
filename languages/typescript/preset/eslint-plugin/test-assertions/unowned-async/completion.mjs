import { ancestorsOf } from '../../rules/analysis/ancestry.mjs';
import { findVariable, isFunctionNode } from '../../rules/analysis/constant-resolution.mjs';
import { enclosingFunction } from '../../test-quality/test-calls.mjs';
import { propertyName } from './nodes.mjs';

const COMPLETIONS = new Set(['AwaitExpression', 'YieldExpression']);
const CARRIERS = new Set([
  'ArrayExpression',
  'ConditionalExpression',
  'LogicalExpression',
  'TSAsExpression',
  'TSNonNullExpression',
  'TSSatisfiesExpression',
  'ChainExpression',
  'CallExpression',
  'NewExpression',
  'MemberExpression',
  'SpreadElement',
]);
const COLLECTING_METHODS = new Set(['push', 'unshift']);
const SCHEDULER_NAME = /scheduler/iu;

function isPromiseExecutor(node) {
  const owner = node.parent;
  return (
    isFunctionNode(node) &&
    owner?.type === 'NewExpression' &&
    owner.callee.type === 'Identifier' &&
    owner.callee.name === 'Promise' &&
    owner.arguments[0] === node
  );
}

function usesOf(context, identifier) {
  const variable =
    identifier?.type === 'Identifier'
      ? findVariable(context, identifier, identifier.name)
      : undefined;
  return (variable?.references ?? []).filter((ref) => !ref.init).map((ref) => ref.identifier);
}

function isCompletion(parent, node, test) {
  if (COMPLETIONS.has(parent.type)) {
    return true;
  }
  if (parent.type === 'ReturnStatement') {
    return enclosingFunction(parent) === test;
  }
  return parent === test && parent.body === node;
}

function boundIdentifier(parent, node) {
  if (node.type === 'FunctionDeclaration') {
    return node.id;
  }
  if (parent.type === 'VariableDeclarator' && parent.init === node) {
    return parent.id;
  }
  return parent.type === 'AssignmentExpression' && parent.right === node ? parent.left : undefined;
}

function collectingArray(parent, node) {
  const isArgument = parent.type === 'CallExpression' && parent.arguments.includes(node);
  return isArgument && COLLECTING_METHODS.has(propertyName(parent.callee))
    ? parent.callee.object
    : undefined;
}

function enclosingValue(parent, node) {
  if (parent.type === 'ReturnStatement') {
    return [enclosingFunction(parent)];
  }
  if (parent.type === 'ArrowFunctionExpression' && parent.body === node) {
    return [parent];
  }
  return parent.type === 'Property' && parent.value === node ? [parent.parent] : [];
}

function carriedTo(context, node, test) {
  const { parent } = node;
  if (!parent) {
    return { next: [] };
  }
  if (isCompletion(parent, node, test)) {
    return { completed: true };
  }
  const direct = CARRIERS.has(parent.type) ? [parent] : [];
  const bound = [boundIdentifier(parent, node), collectingArray(parent, node)];
  return {
    next: [
      ...direct,
      ...enclosingValue(parent, node),
      ...bound.flatMap((identifier) => usesOf(context, identifier)),
    ],
  };
}

function isCompleted(context, promise, test) {
  const pending = [promise];
  for (const node of pending) {
    const carried = carriedTo(context, node, test);
    if (carried.completed) {
      return true;
    }
    const fresh = carried.next.filter((next) => !pending.includes(next));
    for (const next of fresh) {
      pending.push(next);
    }
  }
  return false;
}

export function isInsideCompletedPromise(context, host, test) {
  const ancestors = ancestorsOf(host.node);
  const executors = ancestors.slice(0, ancestors.indexOf(test)).filter(isPromiseExecutor);
  return executors.some((executor) => isCompleted(context, executor.parent, test));
}

function isSchedulerCallback(node) {
  const call = node.parent;
  const isArgument =
    isFunctionNode(node) && call.type === 'CallExpression' && call.arguments.includes(node);
  const object =
    isArgument && call.callee.type === 'MemberExpression' ? call.callee.object : undefined;
  const receiver = object?.type === 'Identifier' ? object.name : propertyName(object);
  return propertyName(call.callee) === 'run' && SCHEDULER_NAME.test(receiver ?? '');
}

export function isInsideScheduler(host, test) {
  const ancestors = ancestorsOf(host.node);
  return ancestors.slice(0, ancestors.indexOf(test)).some(isSchedulerCallback);
}
